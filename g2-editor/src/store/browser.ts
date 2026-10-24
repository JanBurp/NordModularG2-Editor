import { defineStore } from 'pinia';
import { SLOT_LABELS } from '@/constants';
import { getCategorySlug } from '@/constants/categories';
import { DeviceStatus, useDeviceStore } from './device';
import { useSlotsStore } from './slots';
import { showToast } from '@/composables/useToast';

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

		async loadStorage(): Promise<void> {
			if (!window.electronAPI) return;
			const { useSettingsStore } = await import('./settings');
			this.storageDir = await window.electronAPI.patches.storageDir(useSettingsStore().storageFolder || undefined);
			const result = await window.electronAPI.patches.list(this.storageDir);
			// Dot files are the organizer's own temporary copies, not parked patches.
			const files = result.entries.filter((e) => !e.isDir && !e.name.startsWith('.'));
			files.sort((a, b) => a.name.slice(a.name.lastIndexOf('__')).localeCompare(b.name.slice(b.name.lastIndexOf('__'))));
			this.storage = await Promise.all(files.map(storageItemFromFile));
		},

		async removeStorage(items: StorageItem[]): Promise<void> {
			for (const item of items) await window.electronAPI.patches.storageRemove(item.file);
			await this.loadStorage();
		},

		/* Reads `loc` into a new file in the storage dir; a `temp` file is a hidden one,
		 * deleted again by the caller. Returns null when the location is empty. */
		async _readLocation(loc: BankLoc, temp = false): Promise<{ file: string; name: string; category?: string } | null> {
			const entry = this.entryAt(loc);
			// Sorts in creation order (storage lists by it); the random tail keeps two windows apart.
			const id = Date.now().toString(36) + String(storageSeq++ % 1000).padStart(3, '0') + Math.random().toString(36).slice(2, 4);
			const name = entry?.name ?? '';
			// A leading dot is encoded too: dot files are the hidden temporary ones.
			const safeName = encodeURIComponent(name).replace(/^\./, '%2E');
			const file = `${this.storageDir}/${temp ? '.tmp-' : ''}${safeName}__${id}.${extOf(loc.kind)}`;
			const out = JSON.parse((await window.cli.run(['get-location', loc.kind, String(loc.bank), String(loc.location), file])) || '{}');
			if (out.empty || out.corrupt) {
				this.removePatch(loc.bank, loc.location, loc.kind);
				return null;
			}
			return { file, name: out.name ?? name, category: entry?.category };
		},

		async _writeLocation(loc: BankLoc, file: string, name: string, category?: string): Promise<void> {
			await window.cli.run(['put-location', loc.kind, String(loc.bank), String(loc.location), file, name]);
			this.upsertPatch(loc.bank, loc.location, loc.kind, name, category);
		},

		async _clearLocation(loc: BankLoc): Promise<void> {
			await window.cli.run(['clear-patch', loc.kind, String(loc.bank), String(loc.location)]);
			this.removePatch(loc.bank, loc.location, loc.kind);
		},

		/* Runs one organizer operation after the previous one, with the given cells marked
		 * busy. Errors end up in a toast; returns whether the operation succeeded. */
		_organize(locs: BankLoc[], op: () => Promise<void>): Promise<boolean> {
			const run = async (): Promise<boolean> => {
				if (useDeviceStore().status !== DeviceStatus.Connected) {
					showToast('Connect a G2 to organize its banks');
					return false;
				}
				const keys = locs.map((l) => `${l.kind}-${l.bank}-${l.location}`);
				this.organizerBusy.push(...keys);
				try {
					if (!this.storageDir) await this.loadStorage();
					await op();
					return true;
				} catch (e: any) {
					showToast(e.message);
					return false;
				} finally {
					this.organizerBusy = this.organizerBusy.filter((k) => !keys.includes(k));
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
		toStorage(src: BankLoc): Promise<boolean> {
			return this._organize([src], async () => {
				await this._readLocation(src);
			});
		},

		fromStorage(item: StorageItem, dst: BankLoc): Promise<boolean> {
			return this._organize([dst], async () => {
				if (item.kind !== dst.kind) throw new Error(`Cannot put a ${item.kind} into a ${dst.kind} bank`);
				if (this.entryAt(dst)) await this._readLocation(dst);
				await this._writeLocation(dst, item.file, item.name, item.category);
			});
		},

		/* Move (occupied target: swap) or copy (occupied target: parked in storage). */
		moveLocation(src: BankLoc, dst: BankLoc, copy: boolean): Promise<boolean> {
			return this._organize([src, dst], async () => {
				if (src.kind !== dst.kind || (src.bank === dst.bank && src.location === dst.location)) return;
				const occupied = !!this.entryAt(dst);
				const parked = occupied ? await this._readLocation(dst) : null;
				const source = await this._readLocation(src, true);
				if (!source) return;
				try {
					await this._writeLocation(dst, source.file, source.name, source.category);
					if (!copy && parked) {
						await this._writeLocation(src, parked.file, parked.name, parked.category);
						await window.electronAPI.patches.storageRemove(parked.file);
					} else if (!copy) {
						await this._clearLocation(src);
					}
				} finally {
					await window.electronAPI.patches.storageRemove(source.file);
				}
			});
		},

		/* Clears bank locations (the Bank Organizer confirms first). */
		clearLocations(locs: BankLoc[]): Promise<boolean> {
			return this._organize(locs, async () => {
				for (const loc of locs) await this._clearLocation(loc);
			});
		},

		/* Store a live slot (A-D, or the performance when `dst` is a performance bank) at
		 * `dst`, parking an occupied target first. */
		storeSlotAt(slotIndex: 0 | 1 | 2 | 3, dst: BankLoc, name: string): Promise<boolean> {
			return this._organize([dst], async () => {
				if (this.entryAt(dst)) await this._readLocation(dst);
				await this.storePatch(slotIndex, dst.bank, dst.location, dst.kind, name); // reports its own failure
			});
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
