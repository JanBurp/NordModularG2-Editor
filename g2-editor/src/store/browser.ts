import { defineStore } from 'pinia';
import { SLOT_LABELS } from '@/constants';
import { getCategorySlug } from '@/constants/categories';
import { DeviceStatus, useDeviceStore } from './device';
import { useSlotsStore } from './slots';
import { showToast } from '@/composables/useToast';
import { ActionRecorder, HISTORY_SESSION, useOrganizerHistoryStore, type LocContent, type OrganizerAction } from './organizerHistory';

export interface SynthPatch {
	bank: number;
	location: number;
	name: string;
	category?: string;
}

export type BankKind = 'patch' | 'performance';

/* A flash location, 1-based like the CLI's bank/location arguments. */
export interface BankLoc {
	kind: BankKind;
	bank: number;
	location: number;
}

/* A patch/performance parked in the Bank Organizer's storage area (userData/bank-storage).
 * The G2 name lives in the file name (`<encoded name>__<id>.pch2`), as get-location
 * writes no name into the file itself. */
export interface StorageItem {
	file: string;
	name: string;
	kind: BankKind;
	category?: string;
}

/* What a multi-drop places into a bank: a bank location or a Temporary Storage item. */
export type PlaceSource = { type: 'cell'; loc: BankLoc } | { type: 'storage'; item: StorageItem };

const LOCATIONS = 128; // per bank, patches and performances alike

export interface DiskEntry {
	name: string;
	path: string;
	isDir: boolean;
}

const extOf = (kind: BankKind) => (kind === 'performance' ? 'prf2' : 'pch2');

async function storageItemFromFile(entry: DiskEntry): Promise<StorageItem> {
	const base = entry.name.replace(/\.(pch2|prf2)$/i, '');
	const sep = base.lastIndexOf('__');
	const name = decodeURIComponent(sep >= 0 ? base.slice(0, sep) : base);
	const kind: BankKind = /\.prf2$/i.test(entry.name) ? 'performance' : 'patch';
	if (kind === 'performance') return { file: entry.path, name, kind };
	let category: string | undefined;
	try {
		const result = await window.electronAPI.patches.load(entry.path);
		const { PatchParser } = await import('../parser/nmg2PatchParser');
		if (result.success && result.data) category = getCategorySlug(new PatchParser(new Uint8Array(result.data).buffer).parse().description?.category ?? 0);
	} catch {
		// unparsable file: show it without a category
	}
	return { file: entry.path, name, kind, category };
}

// Bank Organizer operations touch the G2 one CLI command at a time; this chains them
// so a second drag never interleaves with a running one.
let organizerQueue: Promise<unknown> = Promise.resolve();
let storageSeq = 0;
// Undo recording for the organizer operation that is running (null outside one / during undo),
// and the patch-file copies of locations this operation already holds, so they aren't read twice.
let recorder: ActionRecorder | null = null;
const known = new Map<string, LocContent>();
const locKey = (l: BankLoc) => `${l.kind}-${l.bank}-${l.location}`;
const fileId = () => Date.now().toString(36) + String(storageSeq++ % 1000).padStart(3, '0') + Math.random().toString(36).slice(2, 4);

/* Options of one organizer operation: `label` makes it undoable; `offline` lets it run without a G2
 * (Temporary Storage only). */
interface OrganizeOptions {
	label?: string;
	offline?: boolean;
}

function bankEntries(bankStr: string, entries: any[], withCategory: boolean): SynthPatch[] {
	return entries.map((e) => ({
		bank: Number(bankStr),
		location: e.location,
		name: e.name,
		...(withCategory && { category: e.category }),
	}));
}

export const useBrowserStore = defineStore('browser', {
	state: () => ({
		view: 'patches' as 'patches' | 'performances' | 'disk',
		synthPatches: [] as SynthPatch[],
		synthPerformances: [] as SynthPatch[],
		collapsedBanks: [] as number[],
		diskFolder: '' as string,
		diskEntries: [] as DiskEntry[],
		loading: false,
		error: '' as string,
		storage: [] as StorageItem[],
		storageDir: '' as string,
		organizerBusy: [] as string[], // `${kind}-${bank}-${location}` keys of cells being changed
		// Running organizer operation, for the Bank Organizer's progress dialog; null when idle.
		organizerProgress: null as { verb: string; done: number; total: number; name: string } | null,
	}),

	actions: {
		/* Populate from startup JSON `names` field (avoids extra `list` call) */
		applyNamesData(names: any): void {
			const toEntries = (banks: any, withCategory: boolean): SynthPatch[] =>
				Object.entries(banks ?? {}).flatMap(([bankStr, entries]) => bankEntries(bankStr, entries as any[], withCategory));
			this.synthPatches = toEntries(names?.patches, true);
			this.synthPerformances = toEntries(names?.performances, false);
		},

		/* Fallback: load list with separate CLI call */
		async loadSynthList(): Promise<void> {
			this.loading = true;
			this.error = '';
			try {
				const output = await window.cli.run(['list']);
				this.applyNamesData(JSON.parse(output));
			} catch (e: any) {
				this.error = e.message;
			} finally {
				this.loading = false;
			}
		},

		removePatch(bank: number, location: number, kind: 'patch' | 'performance'): void {
			const list = kind === 'performance' ? this.synthPerformances : this.synthPatches;
			const idx = list.findIndex((p) => p.bank === bank && p.location === location);
			if (idx >= 0) list.splice(idx, 1);
		},

		upsertPatch(bank: number, location: number, kind: 'patch' | 'performance', name: string, category?: string): void {
			const list = kind === 'performance' ? this.synthPerformances : this.synthPatches;
			const entry: SynthPatch = { bank, location, name, ...(category !== undefined && { category }) };
			const idx = list.findIndex((p) => p.bank === bank && p.location === location);
			if (idx >= 0) list.splice(idx, 1, entry);
			else list.push(entry);
		},

		toggleBank(bank: number): void {
			const idx = this.collapsedBanks.indexOf(bank);
			if (idx >= 0) this.collapsedBanks.splice(idx, 1);
			else this.collapsedBanks.push(bank);
		},

		isBankCollapsed(bank: number): boolean {
			return this.collapsedBanks.includes(bank);
		},

		async loadDiskList(folder: string): Promise<void> {
			this.diskFolder = folder;
			this.loading = true;
			this.error = '';
			try {
				const result = await window.electronAPI.patches.list(folder);
				this.diskEntries = result.success ? result.entries : [];
				if (!result.success) this.error = result.error ?? 'Failed to list files';
			} catch (e: any) {
				this.error = e.message;
			} finally {
				this.loading = false;
			}
		},

		async navigateUp(): Promise<void> {
			if (!this.diskFolder) return;
			const parent = this.diskFolder.split('/').slice(0, -1).join('/') || '/';
			await this.loadDiskList(parent);
		},

		// Returns false when the store failed (already reported with a toast).
		async storePatch(slotIndex: 0 | 1 | 2 | 3, bank: number, location: number, kind: 'patch' | 'performance', name?: string): Promise<boolean> {
			const slot = kind === 'performance' ? 4 : slotIndex;
			try {
				await window.cli.run(['store-patch', String(slot), String(bank), String(location)]);
				const category =
					kind === 'patch' ? getCategorySlug(useSlotsStore().getPatchForSlot(SLOT_LABELS[slotIndex])?.description?.category ?? 0) : undefined;
				this.upsertPatch(bank, location, kind, name ?? '', category);
				useDeviceStore().setStoredLocation(kind === 'performance' ? 'perf' : SLOT_LABELS[slotIndex], bank, location);
				showToast(`Saved ${kind} at ${bank}-${location}`);
				return true;
			} catch (e: any) {
				showToast(e.message);
				return false;
			}
		},

		async clearBank(bank: number, kind: 'patch' | 'performance'): Promise<void> {
			try {
				await window.cli.run(['clear-bank', kind, String(bank)]);
				if (kind === 'performance') {
					this.synthPerformances = this.synthPerformances.filter((p) => p.bank !== bank);
				} else {
					this.synthPatches = this.synthPatches.filter((p) => p.bank !== bank);
				}
			} catch (e: any) {
				showToast(e.message);
			}
		},

		async clearPatch(bank: number, location: number, kind: 'patch' | 'performance'): Promise<void> {
			try {
				await window.cli.run(['clear-patch', kind, String(bank), String(location)]);
				this.removePatch(bank, location, kind);
			} catch (e: any) {
				showToast(e.message);
			}
		},

		entryAt(loc: BankLoc): SynthPatch | undefined {
			const list = loc.kind === 'performance' ? this.synthPerformances : this.synthPatches;
			return list.find((p) => p.bank === loc.bank && p.location === loc.location);
		},

		/* The empty locations of a bank from `start` up to 128, in order. */
		freeFrom(kind: BankKind, bank: number, start: number): BankLoc[] {
			const free: BankLoc[] = [];
			for (let location = start; location <= LOCATIONS; location++) {
				const loc = { kind, bank, location };
				if (!this.entryAt(loc)) free.push(loc);
			}
			return free;
		},

		_step(verb: string, done: number, total: number, name: string): void {
			this.organizerProgress = { verb, done, total, name };
		},

		async loadStorage(): Promise<void> {
			if (!window.electronAPI) return;
			const { useSettingsStore } = await import('./settings');
			const dir = await window.electronAPI.patches.storageDir(useSettingsStore().storageFolder || undefined);
			// Another storage folder: the history's copies lived in the old one.
			if (this.storageDir && dir !== this.storageDir) useOrganizerHistoryStore().clear();
			this.storageDir = dir;
			const result = await window.electronAPI.patches.list(this.storageDir);
			// Dot files are the organizer's own temporary copies, not parked patches.
			const files = result.entries.filter((e) => !e.isDir && !e.name.startsWith('.'));
			files.sort((a, b) => a.name.slice(a.name.lastIndexOf('__')).localeCompare(b.name.slice(b.name.lastIndexOf('__'))));
			this.storage = await Promise.all(files.map(storageItemFromFile));
		},

		/* Deletes Temporary Storage items (undoable: a copy is kept in the history). */
		removeStorage(items: StorageItem[]): Promise<boolean> {
			const label = items.length === 1 ? `Delete "${items[0].name}" from Temporary Storage` : `Delete ${items.length} from Temporary Storage`;
			return this._organize(
				[],
				async () => {
					for (const [i, item] of items.entries()) {
						this._step('Deleting', i, items.length, item.name);
						await this._removeStorageFile(item.file, item.kind);
					}
				},
				{ label, offline: true },
			);
		},

		// ── Undo recording (see organizerHistory.ts) ─────────────────────────────
		_historyFile(kind: BankKind): string {
			return `${this.storageDir}/.history/${HISTORY_SESSION}/${fileId()}.${extOf(kind)}`;
		},

		/* A copy of a patch file in the history folder. */
		async _keep(file: string, kind: BankKind): Promise<string> {
			const copy = this._historyFile(kind);
			await window.electronAPI.patches.storageCopy(file, copy);
			return copy;
		},

		/* Reads a location straight into the history folder (null when empty). */
		async _readInto(loc: BankLoc): Promise<LocContent> {
			const file = this._historyFile(loc.kind);
			const out = JSON.parse((await window.cli.run(['get-location', loc.kind, String(loc.bank), String(loc.location), file])) || '{}');
			return out.empty || out.corrupt ? null : { file, name: out.name ?? '', category: this.entryAt(loc)?.category };
		},

		/* Records what `loc` holds before this operation first changes it. */
		async _before(loc: BankLoc): Promise<void> {
			if (!recorder || recorder.hasBank(loc)) return;
			let content = known.get(locKey(loc)) ?? null;
			if (!content && this.entryAt(loc)) content = await this._readInto(loc); // e.g. before a delete
			recorder.bankBefore(loc, content);
		},

		/* Removes a (non-temporary) storage file, keeping a copy for undo. */
		async _removeStorageFile(file: string, kind: BankKind): Promise<void> {
			if (recorder) recorder.storageTouched(file, await this._keep(file, kind), true, false);
			await window.electronAPI.patches.storageRemove(file);
		},

		/* Reads `loc` into a new file in the storage dir; a `temp` file is a hidden one,
		 * deleted again by the caller. Returns null when the location is empty. */
		async _readLocation(loc: BankLoc, temp = false): Promise<{ file: string; name: string; category?: string } | null> {
			const entry = this.entryAt(loc);
			// Sorts in creation order (storage lists by it); the random tail keeps two windows apart.
			const id = fileId();
			const name = entry?.name ?? '';
			// A leading dot is encoded too: dot files are the hidden temporary ones.
			const safeName = encodeURIComponent(name).replace(/^\./, '%2E');
			const file = `${this.storageDir}/${temp ? '.tmp-' : ''}${safeName}__${id}.${extOf(loc.kind)}`;
			const out = JSON.parse((await window.cli.run(['get-location', loc.kind, String(loc.bank), String(loc.location), file])) || '{}');
			if (out.empty || out.corrupt) {
				this.removePatch(loc.bank, loc.location, loc.kind);
				return null;
			}
			const content = { file, name: out.name ?? name, category: entry?.category };
			if (recorder) {
				const copy = await this._keep(file, loc.kind);
				if (!recorder.hasBank(loc)) known.set(locKey(loc), { ...content, file: copy });
				if (!temp) recorder.storageTouched(file, copy, false, true); // a new storage item
			}
			return content;
		},

		async _writeLocation(loc: BankLoc, file: string, name: string, category?: string): Promise<void> {
			await this._before(loc);
			await window.cli.run(['put-location', loc.kind, String(loc.bank), String(loc.location), file, name]);
			this.upsertPatch(loc.bank, loc.location, loc.kind, name, category);
			if (recorder) {
				const after = { file: await this._keep(file, loc.kind), name, category };
				recorder.bankAfter(loc, after);
				known.set(locKey(loc), after);
			}
		},

		async _clearLocation(loc: BankLoc): Promise<void> {
			await this._before(loc);
			await window.cli.run(['clear-patch', loc.kind, String(loc.bank), String(loc.location)]);
			this.removePatch(loc.bank, loc.location, loc.kind);
			recorder?.bankAfter(loc, null);
			known.delete(locKey(loc));
		},

		/* Runs one organizer operation after the previous one, with the given cells marked
		 * busy. Errors end up in a toast; returns whether the operation succeeded. With a label,
		 * what it changed becomes one undo step - also when it failed halfway, so that part can be
		 * undone too. */
		_organize(locs: BankLoc[], op: () => Promise<void>, opts: OrganizeOptions = {}): Promise<boolean> {
			const run = async (): Promise<boolean> => {
				if (!opts.offline && useDeviceStore().status !== DeviceStatus.Connected) {
					showToast('Connect a G2 to organize its banks');
					return false;
				}
				const keys = locs.map((l) => `${l.kind}-${l.bank}-${l.location}`);
				this.organizerBusy.push(...keys);
				try {
					if (!this.storageDir) await this.loadStorage();
					if (opts.label) recorder = new ActionRecorder(opts.label);
					known.clear();
					await op();
					return true;
				} catch (e: any) {
					showToast(e.message);
					return false;
				} finally {
					const action = recorder?.toAction();
					recorder = null;
					if (action) useOrganizerHistoryStore().push(action);
					this.organizerBusy = this.organizerBusy.filter((k) => !keys.includes(k));
					this.organizerProgress = null;
					await this.loadStorage();
				}
			};
			const result = organizerQueue.then(run);
			organizerQueue = result.catch(() => {});
			return result;
		},

		/* A displaced patch never gets lost: everything below parks an occupied target in
		 * storage before overwriting it, and only clears a source after its copy landed.
		 * Storage <-> bank always copies: the source stays where it was. */
		toStorage(locs: BankLoc[]): Promise<boolean> {
			const label = locs.length === 1 ? `Copy "${this.entryAt(locs[0])?.name ?? ''}" to Temporary Storage` : `Copy ${locs.length} to Temporary Storage`;
			return this._organize(
				locs,
				async () => {
					for (const [i, loc] of locs.entries()) {
						this._step('Copying', i, locs.length, this.entryAt(loc)?.name ?? '');
						await this._readLocation(loc);
					}
				},
				{ label },
			);
		},

		fromStorage(item: StorageItem, dst: BankLoc): Promise<boolean> {
			return this._organize(
				[dst],
				async () => {
					this._step('Copying', 0, 1, item.name);
					if (item.kind !== dst.kind) throw new Error(`Cannot put a ${item.kind} into a ${dst.kind} bank`);
					if (this.entryAt(dst)) await this._readLocation(dst);
					await this._writeLocation(dst, item.file, item.name, item.category);
				},
				{ label: `Copy "${item.name}" to ${dst.bank}-${dst.location}` },
			);
		},

		/* Move (occupied target: swap) or copy (occupied target: parked in storage). */
		moveLocation(src: BankLoc, dst: BankLoc, copy: boolean): Promise<boolean> {
			const verb = copy ? 'Copy' : this.entryAt(dst) ? 'Swap' : 'Move';
			const label = `${verb} "${this.entryAt(src)?.name ?? ''}" to ${dst.bank}-${dst.location}`;
			return this._organize(
				[src, dst],
				async () => {
					if (src.kind !== dst.kind || (src.bank === dst.bank && src.location === dst.location)) return;
					const occupied = !!this.entryAt(dst);
					this._step(copy ? 'Copying' : occupied ? 'Swapping' : 'Moving', 0, 1, this.entryAt(src)?.name ?? '');
					const parked = occupied ? await this._readLocation(dst) : null;
					const source = await this._readLocation(src, true);
					if (!source) return;
					try {
						await this._writeLocation(dst, source.file, source.name, source.category);
						if (!copy && parked) {
							await this._writeLocation(src, parked.file, parked.name, parked.category);
							await this._removeStorageFile(parked.file, src.kind);
						} else if (!copy) {
							await this._clearLocation(src);
						}
					} finally {
						await window.electronAPI.patches.storageRemove(source.file);
					}
				},
				{ label },
			);
		},

		/* Clears bank locations (the Bank Organizer confirms first; undoable). */
		clearLocations(locs: BankLoc[]): Promise<boolean> {
			const label = locs.length === 1 ? `Delete "${this.entryAt(locs[0])?.name ?? ''}"` : `Delete ${locs.length} locations`;
			return this._organize(
				locs,
				async () => {
					for (const [i, loc] of locs.entries()) {
						this._step('Deleting', i, locs.length, this.entryAt(loc)?.name ?? '');
						await this._clearLocation(loc);
					}
				},
				{ label },
			);
		},

		/* Multi-drop: puts each source into the matching (empty) location of `dsts`. Bank sources are
		 * copied, or moved when `move`: they are cleared only after every copy has landed, so a
		 * failure halfway leaves all sources intact. Storage items are always copied. */
		placeMany(sources: PlaceSource[], dsts: BankLoc[], move: boolean): Promise<boolean> {
			const cells = sources.flatMap((s) => (s.type === 'cell' ? [s.loc] : []));
			const clears = move ? cells : [];
			const total = sources.length + clears.length;
			const verb = move && cells.length ? 'Moving' : 'Copying';
			const label = `${move && cells.length ? 'Move' : 'Copy'} ${sources.length} patches to Bank ${dsts[0]?.bank}`;
			return this._organize(
				[...cells, ...dsts],
				async () => {
					for (const [i, src] of sources.entries()) {
						const dst = dsts[i];
						if (src.type === 'storage') {
							this._step(verb, i, total, src.item.name);
							await this._writeLocation(dst, src.item.file, src.item.name, src.item.category);
							continue;
						}
						this._step(verb, i, total, this.entryAt(src.loc)?.name ?? '');
						const copy = await this._readLocation(src.loc, true);
						if (!copy) continue; // emptied in the meantime
						try {
							await this._writeLocation(dst, copy.file, copy.name, copy.category);
						} finally {
							await window.electronAPI.patches.storageRemove(copy.file);
						}
					}
					for (const [i, loc] of clears.entries()) {
						this._step(verb, sources.length + i, total, this.entryAt(loc)?.name ?? '');
						await this._clearLocation(loc);
					}
				},
				{ label },
			);
		},

		/* Store a live slot (A-D, or the performance when `dst` is a performance bank) at
		 * `dst`, parking an occupied target first. */
		storeSlotAt(slotIndex: 0 | 1 | 2 | 3, dst: BankLoc, name: string): Promise<boolean> {
			return this._organize(
				[dst],
				async () => {
					this._step('Storing', 0, 1, name);
					if (this.entryAt(dst)) await this._readLocation(dst);
					await this._before(dst);
					if (!(await this.storePatch(slotIndex, dst.bank, dst.location, dst.kind, name))) return; // reports its own failure
					if (recorder) recorder.bankAfter(dst, await this._readInto(dst)); // what got stored, for redo
				},
				{ label: `Store "${name}" at ${dst.bank}-${dst.location}` },
			);
		},

		/* Undo or redo the newest organizer step. Refused (history.conflict, nothing changed) when a
		 * place no longer holds what the step left there - changed outside the organizer. */
		stepOrganizerHistory(direction: 'undo' | 'redo'): Promise<boolean> {
			const history = useOrganizerHistoryStore();
			const undo = direction === 'undo';
			const action: OrganizerAction | undefined = (undo ? history.undoStack : history.redoStack).at(-1);
			if (!action) return Promise.resolve(false);
			const locs = action.changes.flatMap((c) => (c.type === 'bank' ? [c.loc] : []));
			const changes = undo ? [...action.changes].reverse() : action.changes;
			return this._organize(
				locs,
				async () => {
					const verb = undo ? 'Undoing' : 'Redoing';
					for (const c of changes) {
						const now = c.type === 'bank' ? (this.entryAt(c.loc)?.name ?? null) : this.storage.some((s) => s.file === c.file);
						const expected = c.type === 'bank' ? ((undo ? c.after : c.before)?.name ?? null) : undo ? c.existsAfter : c.existsBefore;
						if (now !== expected) {
							const where = c.type === 'bank' ? `${c.loc.bank}-${c.loc.location}` : 'Temporary Storage';
							history.conflict = `Can't ${direction} "${action.label}": ${where} has changed since. Nothing was changed.`;
							return;
						}
					}
					for (const [i, c] of changes.entries()) {
						this._step(verb, i, changes.length, action.label);
						if (c.type === 'storage') {
							if (undo ? c.existsBefore : c.existsAfter) await window.electronAPI.patches.storageCopy(c.copy, c.file);
							else await window.electronAPI.patches.storageRemove(c.file);
							continue;
						}
						const target = undo ? c.before : c.after;
						if (target) await this._writeLocation(c.loc, target.file, target.name, target.category);
						else await this._clearLocation(c.loc);
					}
					(undo ? history.undoStack : history.redoStack).pop();
					(undo ? history.redoStack : history.undoStack).push(action);
				},
				{ offline: locs.length === 0 },
			);
		},

		setCollapsedBanks(banks: number[]): void {
			this.collapsedBanks = banks;
		},

		async chooseDiskFolder(): Promise<void> {
			const result = await window.electronAPI.patches.setFolder();
			if (result.success && result.folder) {
				const { useSettingsStore } = await import('./settings');
				useSettingsStore().setPath(result.folder);
				await this.loadDiskList(result.folder);
			}
		},
	},
});
