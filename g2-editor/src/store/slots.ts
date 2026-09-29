import type {
	GlobalParamPageAssignment,
	MidiCCAssignment,
	ModuleInstance,
	MorphAssignment,
	ParamPageAssignment,
	Patch,
	PatchParamVariation,
	VariationState,
} from '@/types';
import { PATCH_PARAM_KEYS, NUM_VARIATIONS } from '@/types/patch';
import { findConnectedInputCables, findGroupOutputColor, computeUprateSet, autoRecolorCables, inferUserColours } from '../parser/cableGraph';
import { getModule } from '../renderer/nmg2mods';
import { getParam } from '../renderer/parammap';
import { DEFAULT_PIANO_ROLL_VIEW, SEQNOTE_MODULE_TYPE, visibleNoteWindow, type PianoRollView } from '../renderer/pianoRoll';
import type { ModuleDefinition } from '@/types/module';
import {
	mutAddCable,
	mutAddModule,
	mutDeleteCable,
	mutDeleteModule,
	mutMoveModule,
	mutSetModuleColor,
	mutSetModuleLabel,
	mutSetPianoRollView,
} from '../parser/patchMutations';
import { remapParamValues, remapModeValues, remapCablesForModule } from '../parser/moduleReplace';
import { PATCH_MORPH_MODULE_ID } from '../parser/constants';
import { slotIndexFor, KNOBS_PER_PAGE, TOTAL_KNOB_SLOTS } from '../renderer/paramPages';

import type { Cable } from '@/renderer/cableRenderer';
import type { SlotLabel } from '@/types';
import { defineStore } from 'pinia';
import { showToast } from '../composables/useToast';
import {
	areaConfig,
	findModuleByIndex,
	matchesCableJack,
	isCableSourceEnd,
	resolveColumnCollisions,
	extractVariations,
	removeModuleFromVariations,
	snapshotModuleAssignments,
	computeAssignOne,
	computeAssignModule,
	computeSwap,
	buildTouchedCmds,
	runCliSafe,
	runCliBatchSafe,
	type PasteParamsPair,
} from './slotHelpers';
import { DeviceStatus, useDeviceStore } from './device';
import { useUiStore } from './ui';
import { useHistoryStore } from './history';
import { isAllowedCC } from '@/composables/useMidiCC';
import { bankDownloadReloadingNames, waitForNamesReload } from '@/composables/useBankDownloadDialog';

type ResourceMetrics = { cycles: number; memory: number };
export type SlotResources = { va: ResourceMetrics; fx: ResourceMetrics };

export interface BankDownloadFailure {
	location: number;
	name: string;
	reason: string;
}
export interface BankDownloadResult {
	written: number;
	cleared: number;
	failed: number;
	failures: BankDownloadFailure[];
	aborted: boolean;
	abortReason?: string;
}

function emptySlotResources(): SlotResources {
	return { va: { cycles: 0, memory: 0 }, fx: { cycles: 0, memory: 0 } };
}

// d is the bulk payload. Each block: d[o]=location, d[o+1..o+27]=TPatchLoadData (Delphi indices +1).
// Compound packets pack both areas: block0 at offset 0, 0x72 marker at offset 28, block1 at offset 29.
function parseResourceCycles(d: number[], o: number): number {
	const red1 = d[o + 2] + d[o + 1] * 128;
	const blue1 = d[o + 4] + d[o + 3] * 128;
	return Math.max((100 * red1) / 1372 + (100 * blue1) / 5000, 0);
}

function parseResourceMemory(d: number[], o: number): number {
	const internalMem = d[o + 5];
	const resource4 = d[o + 9] + d[o + 8] * 128;
	const ram = d[o + 22] * 16777216 + d[o + 23] * 65536 + d[o + 24] * 256 + d[o + 25];
	return Math.max(Math.max((100 * internalMem) / 128, (100 * ram) / 260000), (100 * resource4) / 4315);
}

export type { SlotLabel };

const BATCH_CHUNK = 128;

// Maps a controller location code to its CLI location string.
function ccLocationStr(location: number): 'va' | 'patch' | 'fx' {
	return location === 1 ? 'va' : location === 2 ? 'patch' : 'fx';
}

// Maps a 0/1-style location code (fx/va) to its CLI location string. Originally morph-only, now
// also used for Parameter Page / Global Parameter Page location strings (assignKnobCmd/assignGlobalKnobCmd).
function locationStr01(location: 0 | 1): 'fx' | 'va' {
	return location === 0 ? 'fx' : 'va';
}

// Builds the CLI set-morph-range command tuple. Arg order (range before group) matches
// sendCoalesced/armParamEcho's assumption (see below) that cmd[5] is the value being echoed.
function setMorphRangeCmd(
	slot: SlotLabel,
	location: 0 | 1,
	moduleIndex: number,
	paramIndex: number,
	range: number,
	groupIndex: number,
	variation: number,
): string[] {
	return ['set-morph-range', slot, locationStr01(location), String(moduleIndex), String(paramIndex), String(range), String(groupIndex), String(variation)];
}

// Builds the CLI del-cable / add-cable command tuple for a single cable.
function delCableCmd(slot: SlotLabel, location: 'va' | 'fx', c: Cable): string[] {
	return ['del-cable', slot, location, String(c.smod), (c.dir ?? 1) === 0 ? '0' : '1', String(c.scon), String(c.dmod), '0', String(c.dcon)];
}

function addCableCmd(slot: SlotLabel, location: 'va' | 'fx', c: Cable): string[] {
	return ['add-cable', slot, location, String(c.colour), String(c.smod), (c.dir ?? 1) === 0 ? '0' : '1', String(c.scon), String(c.dmod), '0', String(c.dcon)];
}

// Builds the CLI assign-knob command tuple for a single Parameter Page slot.
function assignKnobCmd(slot: SlotLabel, entry: ParamPageAssignment): string[] {
	return ['assign-knob', slot, locationStr01(entry.location), String(entry.moduleIndex), String(entry.paramIndex), String(entry.slotIndex)];
}

// Builds the CLI assign-global-knob command tuple. `active` is the transport slot (uiStore.slotInFocus).
function assignGlobalKnobCmd(active: SlotLabel, entry: GlobalParamPageAssignment): string[] {
	return [
		'assign-global-knob',
		active,
		entry.slot,
		locationStr01(entry.location),
		String(entry.moduleIndex),
		String(entry.paramIndex),
		String(entry.slotIndex),
	];
}

const _paramInFlight = new Set<string>();
const _paramPending = new Map<string, string[]>();

// Best-effort confirmation that a set-param actually reached the device: the G2
// echoes back a param_change watch event whenever a param really changes. If none
// arrives, the device likely silently dropped the command (see g2_io.c send_slot
// doc comment on stale version bytes) — this is an inference from absence, not a
// confirmed rejection, so it only warns and never blocks/throttles sending.
const _paramAwaitingEcho = new Map<string, { value: number; timer: ReturnType<typeof setTimeout> }>();
// The daemon drains all queued stdin commands before forwarding watch events (see cli/src/daemon.c),
// so a burst of sends (e.g. a fast knob/morph-range drag) can delay a legitimate echo past a short
// timeout. 500ms gives real confirmations more room while still catching a truly dropped command.
const PARAM_ECHO_TIMEOUT_MS = 500;

function armParamEcho(key: string, value: number): void {
	const existing = _paramAwaitingEcho.get(key);
	if (existing) clearTimeout(existing.timer);
	const timer = setTimeout(() => {
		_paramAwaitingEcho.delete(key);
		console.warn(`[USB] set-param not confirmed by device: ${key} v=${value}`);
	}, PARAM_ECHO_TIMEOUT_MS);
	_paramAwaitingEcho.set(key, { value, timer });
}

export function resolveParamEcho(key: string, value: number): void {
	const pending = _paramAwaitingEcho.get(key);
	if (pending && pending.value === value) {
		clearTimeout(pending.timer);
		_paramAwaitingEcho.delete(key);
	}
}

function sendCoalesced(key: string, cmd: string[]): void {
	if (_paramInFlight.has(key)) {
		_paramPending.set(key, cmd);
		return;
	}
	_paramInFlight.add(key);
	window.cli
		.run(cmd)
		.catch((err: unknown) => console.error('setParam failed:', err))
		.finally(() => {
			_paramInFlight.delete(key);
			const pending = _paramPending.get(key);
			if (pending) {
				_paramPending.delete(key);
				sendCoalesced(key, pending);
			} else {
				armParamEcho(key, Number(cmd[5]));
			}
		});
}

const SECTION_STARTS = [
	{ section: 2, start: 0 },
	{ section: 3, start: 2 },
	{ section: 4, start: 4 },
	{ section: 5, start: 6 },
	{ section: 6, start: 9 },
	{ section: 7, start: 13 },
	{ section: 8, start: 15 },
];

function deepCloneVariationState(v: VariationState): VariationState {
	return {
		fx: Object.fromEntries(Object.entries(v.fx).map(([k, arr]) => [k, [...arr]])),
		voice: Object.fromEntries(Object.entries(v.voice).map(([k, arr]) => [k, [...arr]])),
		// PatchParamVariation has three array fields; shallow spread handles the rest
		patch: {
			...v.patch,
			morphDials: [...v.patch.morphDials],
			morphModes: [...v.patch.morphModes],
			morphAssignments: v.patch.morphAssignments.map((a) => ({ ...a })),
		},
	};
}

function buildVariationHardwareCmds(slot: SlotLabel, variations: VariationState[], varIdx: number): string[][] {
	const vState = variations[varIdx];
	const cmds: string[][] = [];
	const v = String(varIdx);

	for (const [moduleId, params] of Object.entries(vState.fx)) {
		for (let p = 0; p < params.length; p++) {
			cmds.push(['set-param', slot, 'fx', moduleId, String(p), String(params[p]), v]);
		}
	}
	for (const [moduleId, params] of Object.entries(vState.voice)) {
		for (let p = 0; p < params.length; p++) {
			cmds.push(['set-param', slot, 'va', moduleId, String(p), String(params[p]), v]);
		}
	}

	for (let i = 0; i < 8; i++) {
		cmds.push(['set-param', slot, 'patch', '1', String(i), String(vState.patch.morphDials[i] ?? 0), v]);
		cmds.push(['set-param', slot, 'patch', '1', String(8 + i), String(vState.patch.morphModes[i] ?? 0), v]);
	}

	const patch = vState.patch as unknown as Record<string, number>;
	for (let pi = 0; pi < PATCH_PARAM_KEYS.length; pi++) {
		const key = PATCH_PARAM_KEYS[pi];
		const value = patch[key as string] ?? 0;
		let section = SECTION_STARTS[SECTION_STARTS.length - 1].section;
		let local = pi - SECTION_STARTS[SECTION_STARTS.length - 1].start;
		for (let si = 0; si < SECTION_STARTS.length - 1; si++) {
			if (pi >= SECTION_STARTS[si].start && pi < SECTION_STARTS[si + 1].start) {
				section = SECTION_STARTS[si].section;
				local = pi - SECTION_STARTS[si].start;
				break;
			}
		}
		cmds.push(['set-param', slot, 'patch', String(section), String(local), String(value), v]);
	}

	return cmds;
}

// Builds the CLI add-module command tuple + any non-default set-param commands for the other
// variations, given a module snapshot placed at `newId`/(col, row). Shared by buildModuleAddition
// and deleteModule's undo path (which restores a snapshot directly, without going through
// buildModuleAddition's ModuleInstance-cloning/variations-state-writing steps).
function buildAddModuleCmd(
	src: ModuleInstance,
	newId: number,
	col: number,
	row: number,
	slot: SlotLabel,
	location: 'va' | 'fx',
	numVariations: number,
): { addModuleCmd: string[]; setParamCmds: string[][] } {
	const paramVals0 = src.lv.slice(0, src.pcnt);
	const addModuleCmd = [
		'add-module',
		slot,
		location,
		String(src.type),
		String(newId),
		String(col),
		String(row),
		String(src.colour),
		String(src.modes.length),
		...src.modes.map(String),
		String(src.pcnt),
		...paramVals0.map(String),
		src.uname ?? '',
	];

	const setParamCmds: string[][] = [];
	if (src.pcnt > 0) {
		for (let v = 1; v < numVariations; v++) {
			for (let p = 0; p < src.pcnt; p++) {
				const val = src.lv[v * src.pcnt + p];
				if (val !== undefined && val !== paramVals0[p]) {
					setParamCmds.push(['set-param', slot, location, String(newId), String(p), String(val), String(v)]);
				}
			}
		}
	}

	return { addModuleCmd, setParamCmds };
}

// Shared by addModuleWithData/paste: clones `src` into a new module instance at (col, row), seeds its
// variation param slices, and builds the CLI commands to create it on hardware.
function buildModuleAddition(
	src: ModuleInstance,
	newId: number,
	col: number,
	row: number,
	slot: SlotLabel,
	location: 'va' | 'fx',
	areaKey: 'fx' | 'voice',
	variations: VariationState[] | null | undefined,
): { mod: ModuleInstance; addModuleCmd: string[]; setParamCmds: string[][]; setParamLabelCmds: string[][] } {
	const mod: ModuleInstance = {
		...src,
		index: newId,
		horiz: col,
		vert: row,
		lv: [...src.lv],
		modes: [...src.modes],
		paramLabels: src.paramLabels ? src.paramLabels.map((pl) => ({ ...pl, labels: [...pl.labels] })) : undefined,
	};

	if (variations) {
		for (let v = 0; v < variations.length; v++) {
			const start = v * src.pcnt;
			variations[v][areaKey][newId] = src.lv.slice(start, start + src.pcnt);
		}
	}

	const { addModuleCmd, setParamCmds } = buildAddModuleCmd(src, newId, col, row, slot, location, variations ? variations.length : 1);

	const setParamLabelCmds: string[][] = (src.paramLabels ?? []).map((pl) => [
		'set-param-label',
		slot,
		location,
		String(newId),
		String(pl.paramIndex),
		...pl.labels,
	]);

	return { mod, addModuleCmd, setParamCmds, setParamLabelCmds };
}

interface SlotEntry {
	name: string;
	loading: boolean;
	error: string | null;
	rawHex: string | null;
	templateRawHex: string | null; // last valid rawHex from hardware/file; never cleared
	patch: Patch | null;
	variations: VariationState[] | null; // 9 elements (0-8); null when no patch loaded
	resources: SlotResources;
	assignedVoices: number;
	controllers: MidiCCAssignment[];
	paramPages: ParamPageAssignment[];
	edited: boolean; // true when the slot has unsaved edits since last load/save
	textDirty: boolean; // true when patch notes have been edited but not yet pushed to the device
}

export const useSlotsStore = defineStore('slots', {
	state: () => ({
		slotFilePaths: {
			A: '',
			B: '',
			C: '',
			D: '',
		} as Record<SlotLabel, string>,
		slots: {
			A: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
				controllers: [],
				paramPages: [],
				edited: false,
				textDirty: false,
			},
			B: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
				controllers: [],
				paramPages: [],
				edited: false,
				textDirty: false,
			},
			C: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
				controllers: [],
				paramPages: [],
				edited: false,
				textDirty: false,
			},
			D: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
				controllers: [],
				paramPages: [],
				edited: false,
				textDirty: false,
			},
		} as Record<SlotLabel, SlotEntry>,
		performanceName: '',
		performanceFilePath: '',
		performanceRawHex: null as string | null,
		// Global Parameter Pages: Performance-scoped (not per-slot, unlike SlotEntry.paramPages) —
		// see GlobalParamPageAssignment in types/patch.ts.
		globalParamPages: [] as GlobalParamPageAssignment[],
		uploadingFromFile: false,
		pendingCopyVariation: {} as Record<string, number>,
	}),

	getters: {
		isPerformanceMode: (state) => !!state.performanceName,

		getPatchForSlot: (state) => (slot: SlotLabel) => state.slots[slot]?.patch ?? null,

		getPatchName: (state) => (slot: SlotLabel) => state.slots[slot]?.name ?? '',

		isSlotEdited: (state) => (slot: SlotLabel) => state.slots[slot]?.edited ?? false,

		getAreaModules: (state) => (slot: SlotLabel, area: 0 | 1) => state.slots[slot]?.patch?.areas?.[area]?.modules ?? [],

		getAreaCables: (state) => (slot: SlotLabel, area: 0 | 1) => state.slots[slot]?.patch?.areas?.[area]?.cableList ?? [],

		getPatchParams: (state) => (slot: SlotLabel) => state.slots[slot]?.variations?.map((v) => v.patch) ?? null,

		getVariations: (state) => (slot: SlotLabel) => state.slots[slot]?.variations ?? null,

		activeSlotResources: (state): SlotResources => state.slots[useUiStore().slotInFocus].resources,

		assignedVoicesForSlot:
			(state) =>
			(slot: SlotLabel): number =>
				state.slots[slot].assignedVoices,
	},

	actions: {
		// preserveHistory: true for the hardware-echo auto-resync after our own edit (a structural
		// edit — add/move/delete module, cable changes, etc. — bumps the G2's patch version, which
		// triggers a background reload of this same patch; that reload must not wipe the undo stack
		// or the dirty flag for the edit it's merely confirming). False (default) for a genuine fresh
		// load — explicit slot activation, bank-patch selection, startup, reconnect — where resetting
		// both is correct.
		async _applyPatchOutput(slot: SlotLabel, output: string, preserveHistory = false): Promise<{ name: string; rawHex: string; patch: Patch }> {
			const result = JSON.parse(output);
			const name: string = result.name;
			const rawHex: string = result.data;

			if (rawHex === this.slots[slot].rawHex && this.slots[slot].patch !== null) {
				return { name, rawHex, patch: this.slots[slot].patch };
			}

			const hexPairs = rawHex.match(/.{2}/g);
			if (!hexPairs) throw new Error(`Invalid patch hex for slot ${slot}`);
			const sectionBytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)));
			const nameBytes = new TextEncoder().encode(name);
			const header = new Uint8Array(nameBytes.length + 3);
			header.set(nameBytes);
			header[nameBytes.length] = 0x00;
			header[nameBytes.length + 1] = 0x17;
			header[nameBytes.length + 2] = 0x00;
			const pch2 = new Uint8Array(header.length + sectionBytes.length);
			pch2.set(header, 0);
			pch2.set(sectionBytes, header.length);
			const { PatchParser } = await import('../parser/nmg2PatchParser');
			const patch = new PatchParser(pch2.buffer).parse() as Patch;
			// Patch notes ("Text Pad") aren't part of the bulk patch dump — the daemon fetches
			// them separately (GET_PATCH_TEXT) and reports them as `text` alongside `name`.
			if (result.text) patch.text = result.text;

			this.slots[slot].name = name;
			this.slots[slot].rawHex = rawHex;
			this.slots[slot].templateRawHex = rawHex;
			this.slots[slot].patch = patch;
			this.slots[slot].controllers = patch.controllers ? [...patch.controllers] : [];
			this.slots[slot].paramPages = patch.paramPages ? [...patch.paramPages] : [];
			this.slots[slot].variations = extractVariations(patch);
			patch.mode = {
				area: 1,
				variation: patch.description?.variation ?? 0,
			};
			this._autoRecolorOnLoad(patch);
			if (!preserveHistory) {
				this.slots[slot].edited = false;
				useHistoryStore().clearHistory(slot);
			}
			return { name, rawHex, patch };
		},

		_getActivePatch(): { slot: SlotLabel; patch: Patch } | null {
			const slot = useUiStore().slotInFocus;
			if (!slot) return null;
			const patch = this.slots[slot].patch;
			return patch ? { slot, patch } : null;
		},

		// Central "this slot changed" signal: invalidates the serialization cache (forcing
		// Save to re-serialize) and marks the slot as having unsaved edits.
		_markSlotDirty(slot: SlotLabel): void {
			this.slots[slot].rawHex = null;
			this.slots[slot].edited = true;
		},

		async dumpOne(): Promise<boolean> {
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return false;
			const activeSlot = useUiStore().slotInFocus;
			const slotEntry = this.slots[activeSlot];
			if (!slotEntry.patch) {
				showToast('No patch in active slot to dump');
				return false;
			}
			try {
				// Transmit complete patch in active slot as MIDI SYSEX dump
				// The CLI command will handle the SYSEX transmission
				await window.cli.run(['dump-patch', activeSlot]);
				showToast(`Dumped slot ${activeSlot} as MIDI SYSEX`);
				return true;
			} catch (err) {
				console.error('Failed to dump patch:', err);
				showToast('Failed to dump patch — check device connection.');
				return false;
			}
		},

		async uploadBankFromDevice(type: 'patch' | 'performance', bankNum: number, folder: string, filename?: string): Promise<boolean> {
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return false;

			try {
				// Get bank from device and save to disk
				// The CLI will fetch the entire bank and save individual files + .pchList
				const name = filename || (type === 'patch' ? `PatchBank${bankNum}` : `PerfBank${bankNum}`);
				await window.cli.run(['get-bank', type, String(bankNum), folder, name]);
				return true;
			} catch (err) {
				console.error('Failed to upload bank from device:', err);
				showToast('Failed to upload bank from G2');
				return false;
			}
		},

		async downloadBankToDevice(
			source: { type: 'pchList'; filepath: string } | { type: 'folder'; folderPath: string },
			bankNum: number,
			bankType: 'patch' | 'performance',
		): Promise<BankDownloadResult | null> {
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return null;

			try {
				// Send bank to device
				// WARNING: This OVERWRITES the entire target bank
				const path = source.type === 'pchList' ? source.filepath : source.folderPath;
				const output = await window.cli.run(['send-bank', bankType, source.type, path, String(bankNum)]);
				const result: BankDownloadResult = JSON.parse(output);
				// A bank download can add/remove/rename many patches at once - too broad for
				// the single-entry upsertPatch/removePatch bookkeeping storePatch/clearPatch use.
				// 'list' has no daemon-mode handler (daemon.c has none - only the standalone CLI
				// does), so - like the existing patch_names_updated fallback in useDeviceEvents.ts -
				// use 'reload-names' instead: it emits a "names" watch event that
				// useDeviceEvents.ts already listens for and applies via applyNamesData.
				// Await it (via the dialog's wait/notify pair) so callers only see this resolve
				// once the browser panel's names have actually been refreshed.
				bankDownloadReloadingNames.value = true;
				const namesReloaded = waitForNamesReload();
				window.cli.run(['reload-names']).catch(() => {});
				await namesReloaded;
				// No slot reload here: send-bank writes flash only, it never touches the four
				// live slots. The daemon used to answer the G2's post-write BULK_REARM with a
				// full 4-slot re-fetch, which is what returned garbled "Error" patches; it now
				// just restarts streaming (g2_send_bank in g2_device.c).
				return result;
			} catch (err) {
				console.error('Failed to download bank to device:', err);
				showToast('Failed to download bank to G2');
				return null;
			} finally {
				bankDownloadReloadingNames.value = false;
			}
		},

		async selectSlot(slot: SlotLabel): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const hasPatch = !!this.slots[slot].patch;
			this.slots[slot].loading = !hasPatch;
			this.slots[slot].error = null;
			try {
				if (hasPatch) {
					await window.cli.run(['slot', slot]);
					return null;
				}
				const [, patchOutput] = await window.cli.runBatch([
					['slot', slot],
					['get-patch', slot],
				]);
				return await this._applyPatchOutput(slot, patchOutput);
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},

		async selectVariation(variation: number): Promise<void> {
			const active = useUiStore().slotInFocus;
			if (!active) return;
			await window.cli.run(['variation', String(variation + 1), active]);
		},

		// Moves the G2's front-panel Parameter Page selection (S_SEL_PARAM_PAGE, 0x2d). The device
		// packs Page and Bank into one byte — page*3 + bank — which is exactly the first knob of
		// that page divided by KNOBS_PER_PAGE, so derive it from slotIndexFor rather than
		// re-spelling the arithmetic and letting the two drift apart. There is no separate Bank
		// opcode: changing either selector re-sends the whole byte.
		async selectParamPage(bank: number, page: number): Promise<void> {
			const active = useUiStore().slotInFocus;
			if (!active) return;
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return;
			const pageId = slotIndexFor(bank, page, 0) / KNOBS_PER_PAGE;
			await runCliSafe(['select-param-page', active, String(pageId)], 'selectParamPage');
		},

		// Global Parameter Pages sibling of selectParamPage (S_SEL_GLOBAL_PAGE, 0x1e). `active` here
		// is only the transport slot the command rides on — any of the 4 works interchangeably, per
		// the reference editor (global pages aren't addressed by slot).
		async selectGlobalParamPage(bank: number, page: number): Promise<void> {
			const active = useUiStore().slotInFocus;
			if (!active) return;
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return;
			const pageId = slotIndexFor(bank, page, 0) / KNOBS_PER_PAGE;
			await runCliSafe(['select-global-page', active, String(pageId)], 'selectGlobalParamPage');
		},

		// Toggles the front panel's Parameter Pages knob-assign source between Patch and Global —
		// the SHIFT+GLOBAL combo (opcode 0x3F sub-mode 0x02, system-wide not per-slot). Confirmed
		// against real hardware 2026-08-28: 4 consecutive SHIFT+GLOBAL presses echoed
		// ff0201/ff0200/ff0201/ff0200 in lockstep (01=Global, 00=Patch). This is the actual
		// mode-switch — selectGlobalParamPage/selectParamPage only choose a page *within* whichever
		// source this sets.
		async setKnobSource(isGlobal: boolean): Promise<void> {
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return;
			await runCliSafe(['set-knob-source', isGlobal ? '1' : '0'], 'setKnobSource');
		},

		// Fetches the Global Parameter Pages assignment list from the device (Q_GLOBAL_KNOBS/
		// C_KNOBS_GLOBAL, 0x5e/0x5f) and replaces the local list wholesale. Called once during
		// startup sync (after all 4 slots are loaded) and after a mode-switch rearm — mirrors
		// _applyPatchOutput's role for per-slot patch data, but there's no per-slot template to
		// preserve since this list isn't serialized until a .prf2 save. System-wide, not per-slot
		// (like g2_set_knob_source) — no slot argument needed.
		async loadGlobalKnobs(): Promise<void> {
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return;
			try {
				const output = await window.cli.run(['get-global-knobs']);
				await this._applyGlobalKnobsOutput(output);
			} catch (e) {
				console.error('Failed to load Global Parameter Pages:', e);
			}
		},

		// Shared by loadGlobalKnobs and the synth_settings_update rearm path (useDeviceEvents.ts),
		// which hands back the same {"data": "<hex>"} shape get-global-knobs itself returns.
		async _applyGlobalKnobsOutput(output: string): Promise<void> {
			const result = JSON.parse(output);
			const hex: string | undefined = result.data;
			if (!hex) return;
			const hexPairs = hex.match(/.{2}/g);
			if (!hexPairs) return;
			const bytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)));
			const { parseGlobalKnobsChunk } = await import('../parser/nmg2PatchParser');
			this.globalParamPages = parseGlobalKnobsChunk(bytes);
		},

		async copyVariation(fromVar: number, toVar: number): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot } = ctx;
			const slotEntry = this.slots[slot];
			if (!slotEntry.variations) return;

			const prevState = deepCloneVariationState(slotEntry.variations[toVar]);
			const newState = deepCloneVariationState(slotEntry.variations[fromVar]);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						slotEntry.variations![toVar] = deepCloneVariationState(prevState);
						this._markSlotDirty(slot);
						const cmds = buildVariationHardwareCmds(slot, slotEntry.variations!, toVar);
						if (cmds.length > 0) await runCliBatchSafe(cmds, 'copyVariation undo');
					},
					redo: async () => {
						slotEntry.variations![toVar] = deepCloneVariationState(newState);
						this._markSlotDirty(slot);
						const cmds = buildVariationHardwareCmds(slot, slotEntry.variations!, toVar);
						if (cmds.length > 0) await runCliBatchSafe(cmds, 'copyVariation redo');
					},
				});
			}

			const key = `${slot}:${fromVar}:${toVar}`;
			this.pendingCopyVariation[key] = (this.pendingCopyVariation[key] ?? 0) + 1;
			slotEntry.variations[toVar] = newState;
			this._markSlotDirty(slot);
			await runCliSafe(['copy-variation', slot, String(fromVar), String(toVar)], 'copyVariation');
		},

		handleCopyVariationEvent(slot: SlotLabel, fromVar: number, toVar: number) {
			const key = `${slot}:${fromVar}:${toVar}`;
			if ((this.pendingCopyVariation[key] ?? 0) > 0) {
				this.pendingCopyVariation[key]--;
				if (this.pendingCopyVariation[key] === 0) delete this.pendingCopyVariation[key];
				return;
			}
			const slotEntry = this.slots[slot];
			if (!slotEntry.variations) return;
			slotEntry.variations[toVar] = deepCloneVariationState(slotEntry.variations[fromVar]);
			this._markSlotDirty(slot);
		},

		async deleteModule(moduleId: number, area: 'voice' | 'fx'): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];
			const hist = useHistoryStore();
			const ccLocation = areaIdx === 0 ? 0 : 1;
			const { removedCCSnap, removedPagesSnap, removedGlobalPagesSnap } = snapshotModuleAssignments(
				slotEntry.controllers,
				slotEntry.paramPages,
				this.globalParamPages,
				slot,
				ccLocation,
				moduleId,
			);

			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx].modules, moduleId);
				if (mod) {
					const pcnt = mod.pcnt;
					const numVar = slotEntry.variations?.length ?? 1;
					const lvSnap = Array(pcnt * numVar).fill(0);
					for (let v = 0; v < numVar; v++) {
						const varParams = slotEntry.variations?.[v]?.[areaKey]?.[moduleId] ?? [];
						for (let p = 0; p < pcnt; p++) lvSnap[v * pcnt + p] = varParams[p] ?? 0;
					}
					const modSnap = { ...mod, lv: lvSnap, modes: [...mod.modes] };
					const cableSnap = (patch.areas[areaIdx].cableList ?? []).filter((c) => c.smod === moduleId || c.dmod === moduleId).map((c) => ({ ...c }));
					hist.record(slot, {
						undo: async () => {
							mutAddModule(patch, areaIdx, { ...modSnap, lv: [...modSnap.lv], modes: [...modSnap.modes] });
							const slotE = this.slots[slot];
							if (slotE.variations) {
								for (let v = 0; v < slotE.variations.length; v++) {
									const start = v * modSnap.pcnt;
									slotE.variations[v][areaKey][moduleId] = modSnap.lv.slice(start, start + modSnap.pcnt);
								}
							}
							for (const c of cableSnap) mutAddCable(patch, areaIdx, c);
							if (removedCCSnap.length > 0) slotE.controllers = [...slotE.controllers, ...removedCCSnap];
							if (removedPagesSnap.length > 0) slotE.paramPages = [...slotE.paramPages, ...removedPagesSnap];
							if (removedGlobalPagesSnap.length > 0) this.globalParamPages = [...this.globalParamPages, ...removedGlobalPagesSnap];
							this._markSlotDirty(slot);
							const { addModuleCmd, setParamCmds } = buildAddModuleCmd(
								modSnap,
								moduleId,
								modSnap.horiz,
								modSnap.vert,
								slot,
								location,
								slotE.variations?.length ?? 1,
							);
							const allCmds: string[][] = [addModuleCmd, ...setParamCmds];
							for (const c of cableSnap) allCmds.push(addCableCmd(slot, location, c));
							if (removedCCSnap.length > 0) {
								const flatArgs = removedCCSnap.flatMap((a) => {
									const locStr = ccLocationStr(a.location);
									return [locStr, String(a.moduleIndex), String(a.paramIndex), String(a.cc)];
								});
								allCmds.push(['assign-midicc-batch', slot, ...flatArgs]);
							}
							for (const p of removedPagesSnap) allCmds.push(assignKnobCmd(slot, p));
							for (const p of removedGlobalPagesSnap) allCmds.push(assignGlobalKnobCmd(slot, p));
							if (allCmds.length > 0) {
								await runCliBatchSafe(allCmds, 'deleteModule undo');
							}
						},
						redo: async () => {
							await this.deleteModule(moduleId, area);
						},
					});
				}
			}

			mutDeleteModule(patch, areaIdx, moduleId);
			removeModuleFromVariations(slotEntry.variations, moduleId, areaIdx === 0 ? 'fx' : 'voice');
			if (removedCCSnap.length > 0)
				slotEntry.controllers = slotEntry.controllers.filter((c) => !(c.location === ccLocation && c.moduleIndex === moduleId));
			if (removedPagesSnap.length > 0)
				slotEntry.paramPages = slotEntry.paramPages.filter((k) => !(k.location === ccLocation && k.moduleIndex === moduleId));
			if (removedGlobalPagesSnap.length > 0)
				this.globalParamPages = this.globalParamPages.filter((k) => !(k.slot === slot && k.location === ccLocation && k.moduleIndex === moduleId));
			this._markSlotDirty(slot);

			const deleteCmds: string[][] = [['del-module', slot, location, String(moduleId)]];
			for (const p of removedPagesSnap) deleteCmds.push(['deassign-knob', slot, String(p.slotIndex)]);
			for (const p of removedGlobalPagesSnap) deleteCmds.push(['deassign-global-knob', slot, String(p.slotIndex)]);
			await runCliBatchSafe(deleteCmds, 'deleteModule');

			return { name: slotEntry.name, rawHex: '', patch };
		},

		// Replace = delete the old module + create a new one of `newTypeId` reusing the same module
		// `index`/position/colour, remapping cables (name+colour match) and params/modes (name+type
		// match) from old to new; unmatched cables/params/modes are dropped. See moduleReplace.ts for
		// the remap algorithm and nmg2mods.ts's getReplaceCandidates for how "same group" is decided.
		async replaceModule(moduleId: number, newTypeId: number, area: 'voice' | 'fx'): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];

			const oldMod = findModuleByIndex(patch.areas[areaIdx].modules, moduleId);
			if (!oldMod) return null;
			const oldDef = getModule(oldMod.type);
			const newDef = getModule(newTypeId);
			if (!oldDef || !newDef) return null;

			const hist = useHistoryStore();
			const numVar = slotEntry.variations?.length ?? 1;
			const oldPcnt = oldMod.pcnt;
			const oldLvSnap = Array(oldPcnt * numVar).fill(0);
			for (let v = 0; v < numVar; v++) {
				const varParams = slotEntry.variations?.[v]?.[areaKey]?.[moduleId] ?? [];
				for (let p = 0; p < oldPcnt; p++) oldLvSnap[v * oldPcnt + p] = varParams[p] ?? 0;
			}
			const oldModSnap: ModuleInstance = { ...oldMod, lv: oldLvSnap, modes: [...oldMod.modes] };
			const cableSnap = (patch.areas[areaIdx].cableList ?? []).filter((c) => c.smod === moduleId || c.dmod === moduleId).map((c) => ({ ...c }));

			const ccLocation = areaIdx === 0 ? 0 : 1;
			const { removedCCSnap, removedPagesSnap, removedGlobalPagesSnap } = snapshotModuleAssignments(
				slotEntry.controllers,
				slotEntry.paramPages,
				this.globalParamPages,
				slot,
				ccLocation,
				moduleId,
			);

			const morphLocation: 0 | 1 = areaIdx === 0 ? 0 : 1;
			const morphSnapPerVar: MorphAssignment[][] = Array.from({ length: numVar }, (_, v) =>
				(slotEntry.variations?.[v]?.patch.morphAssignments ?? []).filter((a) => a.location === morphLocation && a.moduleIndex === moduleId),
			);

			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			// If the new module is taller, push modules below it in the same column further down
			// (same collision resolver used by drag-move/palette-drop/paste); computed after
			// deleteModule so the old module is already excluded from its own column.
			let pushDowns: { index: number; fromRow: number; newRow: number }[] = [];

			try {
				await this.deleteModule(moduleId, area);

				const newHeight = newDef.height ?? 2;
				const colMods = patch.areas[areaIdx].modules
					.filter((m) => m.horiz === oldModSnap.horiz)
					.map((m) => ({ index: m.index, vert: m.vert, height: getModule(m.type)?.height ?? 2 }));
				pushDowns = resolveColumnCollisions(colMods, [{ row: oldModSnap.vert, height: newHeight }]).map((d) => ({
					...d,
					fromRow: colMods.find((m) => m.index === d.index)!.vert,
				}));
				for (const d of pushDowns) mutMoveModule(patch, areaIdx, d.index, oldModSnap.horiz, d.newRow);

				// deleteModule doesn't know about morph assignments; drop the replaced module's own
				// (mirrors the "drop always" fallback the CC/paramPage cleanup above already applies).
				for (let v = 0; v < numVar; v++) {
					if (morphSnapPerVar[v].length === 0) continue;
					this._mutateMorphAssignments(
						slot,
						v,
						(prev) => prev.filter((a) => !(a.location === morphLocation && a.moduleIndex === moduleId)),
						async () => {},
					);
				}

				const newPcnt = newDef.params?.length ?? 0;
				const newLv = Array(newPcnt * numVar);
				for (let v = 0; v < numVar; v++) {
					const oldSlice = oldLvSnap.slice(v * oldPcnt, v * oldPcnt + oldPcnt);
					const remapped = remapParamValues(oldDef, newDef, oldSlice);
					for (let p = 0; p < newPcnt; p++) newLv[v * newPcnt + p] = remapped[p];
				}
				const newModes = remapModeValues(oldDef, newDef, oldModSnap.modes);
				const newModuleSrc: ModuleInstance = {
					type: newTypeId,
					index: moduleId,
					horiz: oldModSnap.horiz,
					vert: oldModSnap.vert,
					colour: oldModSnap.colour,
					uprate: 0,
					leds: 0,
					pcnt: newPcnt,
					lv: newLv,
					modes: newModes,
					uname: oldModSnap.uname,
				};

				const { mod, addModuleCmd, setParamCmds, setParamLabelCmds } = buildModuleAddition(
					newModuleSrc,
					moduleId,
					oldModSnap.horiz,
					oldModSnap.vert,
					slot,
					location,
					areaKey,
					slotEntry.variations,
				);
				mutAddModule(patch, areaIdx, mod);

				const remappedCables = remapCablesForModule(cableSnap, moduleId, oldDef, newDef);
				for (const c of remappedCables) mutAddCable(patch, areaIdx, c);

				this._markSlotDirty(slot);
				this._syncUprateAndColors(patch, areaIdx);

				const cliCmds: string[][] = [
					...pushDowns.map((d) => ['move-module', slot, location, String(d.index), String(oldModSnap.horiz), String(d.newRow)]),
					addModuleCmd,
					...setParamCmds,
					...setParamLabelCmds,
				];
				for (const c of remappedCables) cliCmds.push(addCableCmd(slot, location, c));
				await runCliBatchSafe(cliCmds, 'replaceModule');
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}

			if (shouldRecord) {
				hist.record(slot, {
					undo: async () => {
						mutDeleteModule(patch, areaIdx, moduleId); // remove the post-replace module (+ its remapped cables) before restoring the original
						for (const d of pushDowns) mutMoveModule(patch, areaIdx, d.index, oldModSnap.horiz, d.fromRow);
						await this.addModuleWithData(oldModSnap, moduleId, oldModSnap.horiz, oldModSnap.vert, area);
						for (const c of cableSnap) mutAddCable(patch, areaIdx, c);
						if (removedCCSnap.length > 0) slotEntry.controllers = [...slotEntry.controllers, ...removedCCSnap];
						if (removedPagesSnap.length > 0) slotEntry.paramPages = [...slotEntry.paramPages, ...removedPagesSnap];
						if (removedGlobalPagesSnap.length > 0) this.globalParamPages = [...this.globalParamPages, ...removedGlobalPagesSnap];
						this._markSlotDirty(slot);
						this._syncUprateAndColors(patch, areaIdx);

						const undoCmds: string[][] = pushDowns.map((d) => [
							'move-module',
							slot,
							location,
							String(d.index),
							String(oldModSnap.horiz),
							String(d.fromRow),
						]);
						for (const c of cableSnap) undoCmds.push(addCableCmd(slot, location, c));
						if (removedCCSnap.length > 0) {
							const flatArgs = removedCCSnap.flatMap((a) => [
								ccLocationStr(a.location),
								String(a.moduleIndex),
								String(a.paramIndex),
								String(a.cc),
							]);
							undoCmds.push(['assign-midicc-batch', slot, ...flatArgs]);
						}
						for (const p of removedPagesSnap) undoCmds.push(assignKnobCmd(slot, p));
						for (const p of removedGlobalPagesSnap) undoCmds.push(assignGlobalKnobCmd(slot, p));
						if (undoCmds.length > 0) await runCliBatchSafe(undoCmds, 'replaceModule undo');

						for (let v = 0; v < numVar; v++) {
							if (morphSnapPerVar[v].length === 0) continue;
							const vState = this.slots[slot].variations?.[v];
							if (!vState) continue;
							const current = vState.patch.morphAssignments;
							vState.patch.morphAssignments = [...current, ...morphSnapPerVar[v]];
							await this._resyncMorphAssignments(slot, v, current, vState.patch.morphAssignments);
						}
					},
					redo: async () => {
						await this.replaceModule(moduleId, newTypeId, area);
					},
				});
			}

			return { name: slotEntry.name, rawHex: '', patch };
		},

		async moveModuleNoReload(moduleId: number, col: number, row: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			mutMoveModule(patch, areaIdx, moduleId, col, row);
			this._markSlotDirty(slot);

			await runCliSafe(['move-module', slot, location, String(moduleId), String(col), String(row)], 'moveModuleNoReload');
		},

		async addModule(
			typeId: number,
			moduleId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;
			const uiStore = useUiStore();

			const { getModule } = await import('../renderer/nmg2mods');
			const { getParam } = await import('../renderer/parammap');
			const modDef = getModule(typeId);
			const numModes = modDef?.modes?.length ?? 0;
			const modeVals: number[] = Array(numModes).fill(0);
			const numParams = modDef?.params?.length ?? 0;
			const paramVals: number[] = (modDef?.params ?? []).map((p) => getParam(p.type)?.def ?? 64);
			const base = modDef?.short ?? 'Module';
			const sameType = [...patch.areas[0].modules, ...patch.areas[1].modules].filter((m) => m.type === typeId);
			let maxSuffix = 0;
			for (const m of sameType) {
				const match = m.uname?.match(/(\d+)$/);
				if (match) maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10));
			}
			const uname = base + (maxSuffix + 1);

			const lv: number[] = Array(numParams * NUM_VARIATIONS);
			for (let v = 0; v < NUM_VARIATIONS; v++) for (let p = 0; p < numParams; p++) lv[v * numParams + p] = paramVals[p] ?? 64;

			const mod: ModuleInstance = {
				type: typeId,
				index: moduleId,
				horiz: col,
				vert: row,
				colour: uiStore.moduleColor,
				uprate: 0,
				leds: 0,
				pcnt: numParams,
				lv,
				modes: modeVals,
				uname,
			};

			const { areaIdx, location } = areaConfig(area);
			mutAddModule(patch, areaIdx, mod);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const entry = this.slots[slot];
			if (entry.variations) {
				for (const vState of entry.variations) vState[areaKey][moduleId] = [...paramVals];
			}
			this._markSlotDirty(slot);

			await runCliSafe(
				[
					'add-module',
					slot,
					location,
					String(typeId),
					String(moduleId),
					String(col),
					String(row),
					String(mod.colour),
					String(numModes),
					...modeVals.map(String),
					String(numParams),
					...paramVals.map(String),
					uname,
				],
				'addModule',
			);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const modSnap = { ...mod, lv: [...mod.lv], modes: [...mod.modes] };
				hist.record(slot, {
					undo: async () => {
						await this.deleteModule(moduleId, area);
					},
					redo: async () => {
						await this.addModuleWithData(modSnap, moduleId, col, row, area);
					},
				});
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async addModuleWithData(src: ModuleInstance, newId: number, col: number, row: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const entry = this.slots[slot];

			const { mod, addModuleCmd, setParamCmds, setParamLabelCmds } = buildModuleAddition(src, newId, col, row, slot, location, areaKey, entry.variations);
			mutAddModule(patch, areaIdx, mod);
			this._markSlotDirty(slot);

			await runCliSafe(addModuleCmd, 'addModuleWithData add-module');
			if (setParamCmds.length > 0) await runCliBatchSafe(setParamCmds, 'addModuleWithData set-param batch');
			if (setParamLabelCmds.length > 0) await runCliBatchSafe(setParamLabelCmds, 'addModuleWithData set-param-label batch');

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const modSnap = { ...mod, lv: [...mod.lv], modes: [...mod.modes] };
				hist.record(slot, {
					undo: async () => {
						await this.deleteModule(newId, area);
					},
					redo: async () => {
						await this.addModuleWithData(modSnap, newId, col, row, area);
					},
				});
			}
		},

		async paste(
			entries: { src: ModuleInstance; newId: number; col: number; row: number }[],
			cables: { newSmod: number; newDmod: number; colour: number; userColour?: number; scon: number; dcon: number; dir: number }[],
			area: 'voice' | 'fx',
		): Promise<void> {
			if (entries.length === 0) return;
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const hist = useHistoryStore();
			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			try {
				const { getModule } = await import('../renderer/nmg2mods');
				const currentModules = patch.areas[areaIdx].modules;
				const newIdSet = new Set(entries.map((e) => e.newId));

				const occupantsByCol = new Map<number, { row: number; height: number }[]>();
				for (const e of entries) {
					const height = getModule(e.src.type)?.height ?? 2;
					if (!occupantsByCol.has(e.col)) occupantsByCol.set(e.col, []);
					occupantsByCol.get(e.col)!.push({ row: e.row, height });
				}

				const pushDowns: { index: number; col: number; newRow: number }[] = [];
				for (const [col, occupants] of occupantsByCol) {
					const stationary = currentModules
						.filter((m) => m.horiz === col && !newIdSet.has(m.index))
						.map((m) => ({ index: m.index, vert: m.vert, height: getModule(m.type)?.height ?? 2 }));
					for (const d of resolveColumnCollisions(stationary, occupants)) {
						pushDowns.push({ index: d.index, col, newRow: d.newRow });
					}
				}

				// Capture original positions of pushed modules for undo
				const movedBack = pushDowns.map((d) => {
					const orig = currentModules.find((m) => m.index === d.index);
					return { index: d.index, col: d.col, fromRow: orig?.vert ?? d.newRow, toRow: d.newRow };
				});

				if (pushDowns.length > 0) {
					for (const p of pushDowns) mutMoveModule(patch, areaIdx, p.index, p.col, p.newRow);
					this._markSlotDirty(slot);
					await runCliBatchSafe(
						pushDowns.map((p) => ['move-module', slot, location, String(p.index), String(p.col), String(p.newRow)]),
						'paste move-module batch',
					);
				}

				const slotEntry = this.slots[slot];
				const areaKey = areaIdx === 0 ? 'fx' : 'voice';
				const allCmds: string[][] = [];

				for (const { src, newId, col, row } of entries) {
					const { mod, addModuleCmd, setParamCmds, setParamLabelCmds } = buildModuleAddition(
						src,
						newId,
						col,
						row,
						slot,
						location,
						areaKey,
						slotEntry.variations,
					);
					mutAddModule(patch, areaIdx, mod);
					allCmds.push(addModuleCmd, ...setParamCmds, ...setParamLabelCmds);
				}

				const addedCables = cables.map((c) => ({ smod: c.newSmod, scon: c.scon, dmod: c.newDmod, dcon: c.dcon, dir: c.dir, colour: c.colour }));
				for (const { newSmod, newDmod, colour, userColour, scon, dcon, dir } of cables) {
					mutAddCable(patch, areaIdx, { colour, userColour, smod: newSmod, scon, dir, dmod: newDmod, dcon });
					const fromConType = dir === 1 ? 1 : 0;
					allCmds.push([
						'add-cable',
						slot,
						location,
						String(colour),
						String(newSmod),
						String(fromConType),
						String(scon),
						String(newDmod),
						'0',
						String(dcon),
					]);
				}

				this._markSlotDirty(slot);
				// Send module commands first (add-module + set-param), then cable commands.
				// The G2 firmware cannot reference a newly-added module in the same compound
				// frame as add-cable — splitting into two sequential batches avoids G2_ERR_SEND.
				const moduleCmds = allCmds.filter((c) => c[0] !== 'add-cable');
				const cableCmds = allCmds.filter((c) => c[0] === 'add-cable');
				for (let i = 0; i < moduleCmds.length; i += BATCH_CHUNK) await runCliBatchSafe(moduleCmds.slice(i, i + BATCH_CHUNK), 'paste batch');
				for (let i = 0; i < cableCmds.length; i += BATCH_CHUNK) await runCliBatchSafe(cableCmds.slice(i, i + BATCH_CHUNK), 'paste batch');

				if (shouldRecord) {
					const addedIds = entries.map((e) => e.newId);
					hist.record(slot, {
						undo: async () => {
							// Delete added cables first
							const delCableCmds = addedCables.map((c) => [
								'del-cable',
								slot,
								location,
								String(c.smod),
								c.dir === 0 ? '0' : '1',
								String(c.scon),
								String(c.dmod),
								'0',
								String(c.dcon),
							]);
							for (const c of addedCables) mutDeleteCable(patch, areaIdx, c);
							// Delete added modules
							const delModCmds = addedIds.map((id) => ['del-module', slot, location, String(id)]);
							for (const id of addedIds) {
								mutDeleteModule(patch, areaIdx, id);
								removeModuleFromVariations(this.slots[slot].variations, id, areaIdx === 0 ? 'fx' : 'voice');
							}
							// Restore pushed-down modules
							const moveCmds = movedBack.map((m) => ['move-module', slot, location, String(m.index), String(m.col), String(m.fromRow)]);
							for (const m of movedBack) mutMoveModule(patch, areaIdx, m.index, m.col, m.fromRow);
							this._markSlotDirty(slot);
							const allUndoCmds = [...delCableCmds, ...delModCmds, ...moveCmds];
							if (allUndoCmds.length > 0) {
								await runCliBatchSafe(allUndoCmds, 'paste undo');
							}
						},
						redo: async () => {
							const currentCtx = this._getActivePatch();
							if (currentCtx) {
								const currentMods = currentCtx.patch.areas[areaIdx].modules;
								const currentIdSet = new Set(currentMods.map((m) => m.index));
								const reEntries = entries.filter((e) => !currentIdSet.has(e.newId));
								if (reEntries.length > 0) await this.paste(reEntries, cables, area);
							}
						},
					});
				}
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}
		},

		// Shared by _syncUprateAndColors/_autoRecolorOnLoad: module defs + current uprate set for an area.
		_uprateContext(patch: Patch, areaIdx: 0 | 1): { uprateSet: Set<number>; modDefMap: Map<number, ModuleDefinition> } {
			const area = patch.areas[areaIdx];
			const areaModDefs = (area.modules ?? [])
				.map((m) => ({ index: m.index, def: getModule(m.type) as ModuleDefinition | undefined }))
				.filter((m): m is { index: number; def: ModuleDefinition } => m.def !== undefined);
			const uprateSet = computeUprateSet(area.cableList ?? [], areaModDefs);
			return { uprateSet, modDefMap: new Map(areaModDefs.map((m) => [m.index, m.def])) };
		},

		// Recomputes uprate flags on all modules in the area and recolors auto-colored cables.
		// Called after any cable topology change so the editor stays in sync without hardware confirmation.
		_syncUprateAndColors(patch: Patch, areaIdx: 0 | 1): void {
			const area = patch.areas[areaIdx];
			const { uprateSet, modDefMap } = this._uprateContext(patch, areaIdx);
			for (const m of area.modules ?? []) {
				m.uprate = uprateSet.has(m.index) ? 1 : 0;
			}
			patch.areas[areaIdx].cableList = autoRecolorCables(area.cableList ?? [], uprateSet, modDefMap) as unknown as (typeof patch.areas)[0]['cableList'];
		},

		// On load: infer user-overridden colours from the freshly-parsed cables (the wire format has
		// no bit to persist userColour, so it's reconstructed by diffing stored vs computed colour),
		// then recompute uprate + auto-recolor everything that wasn't inferred as an override.
		_autoRecolorOnLoad(patch: Patch): void {
			for (const areaIdx of [0, 1] as const) {
				const cables = patch.areas[areaIdx]?.cableList ?? [];
				if (cables.length === 0) continue;
				const { uprateSet, modDefMap } = this._uprateContext(patch, areaIdx);
				patch.areas[areaIdx].cableList = inferUserColours(cables, uprateSet, modDefMap) as unknown as (typeof patch.areas)[0]['cableList'];
				this._syncUprateAndColors(patch, areaIdx);
			}
		},

		async addCable(
			fromMod: number,
			fromConType: number,
			fromCon: number,
			toMod: number,
			toConType: number,
			toCon: number,
			area: 'voice' | 'fx',
			color = 1,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const hist = useHistoryStore();
			const shouldRecord = !hist.isLocked(slot);
			// Snapshot cable list before mutation to compute delta for undo
			const preCableList = shouldRecord ? (patch.areas[areaIdx].cableList ?? []).map((c) => ({ ...c })) : [];

			// Enforce output→input direction (source must be output, matching CLI swap logic)
			let smod = fromMod,
				scon = fromCon,
				stype = fromConType;
			let dmod = toMod,
				dcon = toCon,
				dtype = toConType;
			let dir = 1;
			if (stype === 0 && dtype !== 0) {
				// source is input, dest is output: swap to normalise
				[smod, scon, stype, dmod, dcon, dtype] = [dmod, dcon, dtype, smod, scon, stype];
			} else if (stype === 0 && dtype === 0) {
				// input-to-input: no swap needed
				dir = 0;
			}

			// For input-to-input cables, inherit color from any output already in the connected group
			const effectiveColor = dir === 0 ? findGroupOutputColor(patch.areas[areaIdx].cableList ?? [], smod, scon, dmod, dcon) : color;

			const cable = { colour: effectiveColor, smod, scon, dir, dmod, dcon };
			mutAddCable(patch, areaIdx, cable);
			this._markSlotDirty(slot);

			const mainCmd = [
				'add-cable',
				slot,
				location,
				String(effectiveColor),
				String(fromMod),
				String(fromConType),
				String(fromCon),
				String(toMod),
				String(toConType),
				String(toCon),
			];

			// Recolor dir=0 cables in the input group to match an output that was just connected or already present
			const recolorCmds: string[][] = [];
			const recolorGroup = (startMod: number, startCon: number, targetColor: number) => {
				const cableList = patch.areas[areaIdx].cableList ?? [];
				const toRecolor = new Set(findConnectedInputCables(cableList, startMod, startCon).filter((gc) => gc.colour !== targetColor));
				if (toRecolor.size > 0) {
					// Replace cable objects (new array) so Vue's watcher detects the change
					patch.areas[areaIdx].cableList = cableList.map((c) => {
						if (!toRecolor.has(c)) return c;
						const gsmod = c.smod ?? 0,
							gscon = c.scon ?? 0,
							gdmod = c.dmod ?? 0,
							gdcon = c.dcon ?? 0;
						recolorCmds.push(['del-cable', slot, location, String(gsmod), '0', String(gscon), String(gdmod), '0', String(gdcon)]);
						recolorCmds.push([
							'add-cable',
							slot,
							location,
							String(targetColor),
							String(gsmod),
							'0',
							String(gscon),
							String(gdmod),
							'0',
							String(gdcon),
						]);
						return { ...c, colour: targetColor };
					});
				}
			};
			if (dir === 1) {
				recolorGroup(dmod, dcon, effectiveColor);
			} else if (effectiveColor !== color) {
				// Merged two groups; recolor the full connected set (new cable links them)
				recolorGroup(smod, scon, effectiveColor);
			}

			if (recolorCmds.length > 0) {
				await runCliBatchSafe([mainCmd, ...recolorCmds], 'addCable');
			} else {
				await runCliSafe(mainCmd, 'addCable');
			}

			// Recompute signal-rate uprate and recolor cables that changed rate (local display only).
			this._syncUprateAndColors(patch, areaIdx);

			if (shouldRecord) {
				const postCableList = patch.areas[areaIdx].cableList ?? [];
				// Added cable = in post but not in pre
				const addedCable =
					postCableList.find((c) => !preCableList.some((b) => b.smod === c.smod && b.scon === c.scon && b.dmod === c.dmod && b.dcon === c.dcon)) ??
					cable;
				// Recolored cables = in both pre and post but with different colour
				const recoloredOrig = preCableList.filter((b) => {
					const after = postCableList.find((a) => a.smod === b.smod && a.scon === b.scon && a.dmod === b.dmod && a.dcon === b.dcon);
					return after && after.colour !== b.colour;
				});
				hist.record(slot, {
					undo: async () => {
						// Delete the added cable
						mutDeleteCable(patch, areaIdx, addedCable);
						this._markSlotDirty(slot);
						await runCliSafe(
							[
								'del-cable',
								slot,
								location,
								String(addedCable.smod),
								addedCable.dir === 0 ? '0' : '1',
								String(addedCable.scon),
								String(addedCable.dmod),
								'0',
								String(addedCable.dcon),
							],
							'addCable undo',
						);
						// Restore recolored cables
						if (recoloredOrig.length > 0) {
							patch.areas[areaIdx].cableList = (patch.areas[areaIdx].cableList ?? []).map((c) => {
								const orig = recoloredOrig.find((b) => b.smod === c.smod && b.scon === c.scon && b.dmod === c.dmod && b.dcon === c.dcon);
								return orig ? { ...c, colour: orig.colour } : c;
							});
							this._markSlotDirty(slot);
							const restoreCmds: string[][] = [];
							for (const b of recoloredOrig) {
								restoreCmds.push([
									'del-cable',
									slot,
									location,
									String(b.smod),
									b.dir === 0 ? '0' : '1',
									String(b.scon),
									String(b.dmod),
									'0',
									String(b.dcon),
								]);
								restoreCmds.push([
									'add-cable',
									slot,
									location,
									String(b.colour),
									String(b.smod),
									b.dir === 0 ? '0' : '1',
									String(b.scon),
									String(b.dmod),
									'0',
									String(b.dcon),
								]);
							}
							await runCliBatchSafe(restoreCmds, 'addCable undo (recolor restore)');
						}
						// Re-sync uprate after undo so module flags and display are correct.
						this._syncUprateAndColors(patch, areaIdx);
					},
					redo: async () => {
						await this.addCable(fromMod, fromConType, fromCon, toMod, toConType, toCon, area, color);
					},
				});
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		// targetSlot overrides the default (uiStore.slotInFocus, via _getActivePatch) — needed by
		// Global Parameter Pages knobs, which can target a module in a DIFFERENT slot than the one
		// currently shown on canvas (ParameterPages.vue's Global Pages mode).
		async setParam(
			moduleId: number,
			paramIdx: number,
			value: number,
			variation: number,
			area: 'voice' | 'fx',
			immediate = false,
			targetSlot?: SlotLabel,
		): Promise<void> {
			const slot = targetSlot ?? this._getActivePatch()?.slot;
			if (!slot || !this.slots[slot]?.patch) return;

			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];

			// Capture prev value before mutation
			const prevValue = slotEntry.variations?.[variation]?.[areaKey]?.[moduleId]?.[paramIdx] ?? value;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `param:${area}:${moduleId}:${paramIdx}:${variation}`;
				const box = { initial: prevValue, latest: value };
				hist.record(
					slot,
					{
						undo: async () => {
							await this.setParam(moduleId, paramIdx, box.initial, variation, area, false, slot);
						},
						redo: async () => {
							await this.setParam(moduleId, paramIdx, box.latest, variation, area, false, slot);
						},
					},
					cKey,
					box,
				);
			}

			if (slotEntry.variations?.[variation]?.[areaKey]?.[moduleId]) {
				slotEntry.variations[variation][areaKey][moduleId][paramIdx] = value;
			}
			this._markSlotDirty(slot);

			const key = `${slot}:${location}:${moduleId}:${paramIdx}:${variation}`;
			const cmd = ['set-param', slot, location, String(moduleId), String(paramIdx), String(value), String(variation)];
			if (immediate) {
				window.cli
					.run(cmd)
					.then(() => armParamEcho(key, value))
					.catch((err: unknown) => console.error('setParam failed:', err));
			} else {
				sendCoalesced(key, cmd);
			}
		},

		// Batched sibling of setParam for applying several params as one user action (e.g. a
		// DrumSynth preset), so a single Ctrl+Z reverts all of them together — same "apply the whole
		// list, one hist.record" shape as _applyParamPages/swapParamPageSlots, not setParam's
		// per-param coalescing (there's no rapid-drag case to coalesce here).
		async setParams(
			moduleId: number,
			paramIndices: number[],
			values: number[],
			variation: number,
			area: 'voice' | 'fx',
			targetSlot?: SlotLabel,
		): Promise<void> {
			const slot = targetSlot ?? this._getActivePatch()?.slot;
			if (!slot || !this.slots[slot]?.patch) return;

			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];
			const moduleParams = slotEntry.variations?.[variation]?.[areaKey]?.[moduleId];

			const prevValues = paramIndices.map((idx, i) => moduleParams?.[idx] ?? values[i]);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						await this.setParams(moduleId, paramIndices, prevValues, variation, area, slot);
					},
					redo: async () => {
						await this.setParams(moduleId, paramIndices, values, variation, area, slot);
					},
				});
			}

			if (moduleParams) {
				paramIndices.forEach((idx, i) => {
					moduleParams[idx] = values[i];
				});
			}
			this._markSlotDirty(slot);

			const cmds = paramIndices.map((idx, i) => ['set-param', slot, location, String(moduleId), String(idx), String(values[i]), String(variation)]);
			await runCliBatchSafe(cmds, 'setParams');
		},

		// Rnd/Clr on sequencer modules (SeqNote/SeqVal/SeqLev/SeqCtr) are computed entirely here in
		// the editor, then pushed as ordinary set-param messages — the real editor's Rnd never asks
		// hardware to randomize (CPnlNoteSeqClrRnd::GetRequestedChange in G2Editor.c calls rand()
		// client-side too). Touches both the value row (Seq1StepN) and the on/off gate row
		// (Seq2StepN, where present), for all 16 steps regardless of Length — Length only affects
		// playback, not which steps Rnd/Clr touch; setParams makes the whole press one undo/redo entry.
		async randomizeOrClearSeqSteps(moduleId: number, variation: number, area: 'voice' | 'fx', mode: 'rnd' | 'clr'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const { areaIdx } = areaConfig(area);
			const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleId);
			const params = (mod ? getModule(mod.type) : null)?.params;
			if (!mod || !params) return;

			const stepIndices: number[] = [];
			const gateIndices: number[] = [];
			for (let n = 1; n <= 16; n++) {
				const idx = params.findIndex((p) => p.name === `Seq1Step${n}`);
				if (idx >= 0) stepIndices.push(idx);
				const gateIdx = params.findIndex((p) => p.name === `Seq2Step${n}`);
				if (gateIdx >= 0) gateIndices.push(gateIdx);
			}
			if (stepIndices.length === 0) return;

			const stepType = getParam(params[stepIndices[0]].type);
			if (!stepType) return;
			const gateType = gateIndices.length > 0 ? getParam(params[gateIndices[0]].type) : undefined;

			const randomIn = (low: number, high: number) => low + Math.floor(Math.random() * (high - low + 1));

			// SeqNote's Rnd is bounded by its own piano-roll zoom/octave window (CSeqSliderGUI's
			// GetLowLimit/GetRange in the real editor); other Seq modules have no such window and
			// randomize across the param's full type range, as before.
			let valueLow = stepType.low;
			let valueHigh = stepType.high;
			if (mod.type === SEQNOTE_MODULE_TYPE) {
				const view = mod.pianoRollView ?? DEFAULT_PIANO_ROLL_VIEW;
				const window = visibleNoteWindow(view.zoom, view.octaveOffset);
				valueLow = window.low;
				valueHigh = window.high;
			}

			// Rnd/Clr always act on all 16 steps, regardless of Length — Length only affects playback.
			const paramIndices = [...stepIndices];
			const values = paramIndices.map(() => (mode === 'rnd' ? randomIn(valueLow, valueHigh) : stepType.def));

			if (gateType) {
				paramIndices.push(...gateIndices);
				values.push(...gateIndices.map(() => (mode === 'rnd' ? randomIn(gateType.low, gateType.high) : gateType.def)));
			}

			await this.setParams(moduleId, paramIndices, values, variation, area, slot);
		},

		// The G2's own onboard Rnd/Clr (pressed directly on the unit) randomizes within *its own*
		// stored piano-roll window, unaware of what this editor currently shows — see
		// randomizeOrClearSeqSteps's comment. We never send the Rnd/Clr trigger param ourselves (see
		// useModuleParams.ts), so any incoming press of it (this is called from every incoming
		// param_change in useSlotEvents.ts) must be physical: immediately recompute and push
		// corrected, windowed values, overwriting hardware's own out-of-range result within
		// milliseconds — the same procedure as pressing Rnd/Clr in this editor.
		maybeCorrectHardwareRndOrClr(slot: SlotLabel, moduleId: number, paramIndex: number, value: number, variation: number, area: 'voice' | 'fx'): void {
			if (value !== 1) return;
			const patch = this.slots[slot]?.patch;
			if (!patch) return;
			const { areaIdx } = areaConfig(area);
			const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleId);
			const param = mod ? getModule(mod.type)?.params?.[paramIndex] : undefined;
			if (param?.type !== 'TrigBtn' || (param.name !== 'Rnd' && param.name !== 'Clr')) return;
			this.randomizeOrClearSeqSteps(moduleId, variation, area, param.name === 'Rnd' ? 'rnd' : 'clr');
		},

		async setMode(moduleId: number, modeIdx: number, value: number, variation: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleId);
			const prevValue = mod?.modes?.[modeIdx] ?? value;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `mode:${area}:${moduleId}:${modeIdx}`;
				const box = { initial: prevValue, latest: value };
				hist.record(
					slot,
					{
						undo: async () => {
							await this.setMode(moduleId, modeIdx, box.initial, variation, area);
						},
						redo: async () => {
							await this.setMode(moduleId, modeIdx, box.latest, variation, area);
						},
					},
					cKey,
					box,
				);
			}

			if (mod?.modes) mod.modes[modeIdx] = value;
			this._markSlotDirty(slot);

			await runCliSafe(['set-module-mode', slot, location, String(moduleId), String(modeIdx), String(value)], 'setMode');
		},

		async pasteParams(pairs: PasteParamsPair[], variation: number, area: 'voice' | 'fx'): Promise<void> {
			if (pairs.length === 0) return;
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const prevPairs: PasteParamsPair[] = pairs.map(({ targetId }) => {
					const mod = findModuleByIndex(patch.areas[areaIdx].modules, targetId);
					return {
						targetId,
						paramValues: slotEntry.variations?.[variation]?.[areaKey]?.[targetId]?.slice() ?? [],
						modeValues: mod ? [...mod.modes] : [],
					};
				});
				hist.record(slot, {
					undo: async () => {
						await this.pasteParams(prevPairs, variation, area);
					},
					redo: async () => {
						await this.pasteParams(pairs, variation, area);
					},
				});
			}

			const cmds: string[][] = [];
			for (const { targetId, paramValues, modeValues } of pairs) {
				const paramSlot = slotEntry.variations?.[variation]?.[areaKey]?.[targetId];
				if (paramSlot) {
					paramValues.forEach((value, paramIdx) => {
						paramSlot[paramIdx] = value;
						cmds.push(['set-param', slot, location, String(targetId), String(paramIdx), String(value), String(variation)]);
					});
				}
				const mod = findModuleByIndex(patch.areas[areaIdx].modules, targetId);
				if (mod?.modes) {
					modeValues.forEach((value, modeIdx) => {
						mod.modes[modeIdx] = value;
						cmds.push(['set-module-mode', slot, location, String(targetId), String(modeIdx), String(value)]);
					});
				}
			}
			this._markSlotDirty(slot);
			if (cmds.length > 0) await runCliBatchSafe(cmds, 'pasteParams');
		},

		async loadSlot(slot: SlotLabel, preserveHistory = false): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const output = await window.cli.run(['get-patch', slot]);
				return await this._applyPatchOutput(slot, output, preserveHistory);
			} catch (e: any) {
				if (!this.slots[slot].patch) {
					this.slots[slot].error = e.message;
				} else {
					console.warn(`loadSlot(${slot}) reload failed, keeping existing data:`, e.message);
				}
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},

		loadPatchFile(slot: SlotLabel, patch: Patch, name: string, rawHex?: string, filepath?: string): void {
			this.slots[slot].patch = patch;
			this.slots[slot].variations = extractVariations(patch);
			this.slots[slot].name = name;
			this.slots[slot].controllers = patch.controllers ? [...patch.controllers] : [];
			this.slots[slot].paramPages = patch.paramPages ? [...patch.paramPages] : [];
			if (rawHex) {
				this.slots[slot].rawHex = rawHex;
				this.slots[slot].templateRawHex = rawHex;
			}
			if (filepath) this.slotFilePaths[slot] = filepath;
			this._autoRecolorOnLoad(patch);
			this.slots[slot].edited = false;
			useHistoryStore().clearHistory(slot);
		},

		loadPerformanceFile(
			patches: Patch[],
			slotNames: string[],
			name: string,
			rawHex: string,
			filepath?: string,
			globalParamPages?: GlobalParamPageAssignment[],
		): void {
			const labels: SlotLabel[] = ['A', 'B', 'C', 'D'];
			const hist = useHistoryStore();
			for (let i = 0; i < 4; i++) {
				const slotName = slotNames[i] || name;
				this.slots[labels[i]].patch = patches[i];
				this.slots[labels[i]].variations = extractVariations(patches[i]);
				this.slots[labels[i]].name = slotName;
				this.slots[labels[i]].controllers = patches[i].controllers ? [...patches[i].controllers!] : [];
				this.slots[labels[i]].paramPages = patches[i].paramPages ? [...patches[i].paramPages!] : [];
				// Per-slot rawHex is NOT set — prf2 serialization uses the full performance template
				this.slots[labels[i]].rawHex = null;
				this.slots[labels[i]].templateRawHex = null;
				this.slots[labels[i]].edited = false;
				this.slotFilePaths[labels[i]] = '';
				this._autoRecolorOnLoad(patches[i]);
				hist.clearHistory(labels[i]);
			}
			this.performanceName = name;
			this.performanceRawHex = rawHex;
			this.performanceFilePath = filepath ?? '';
			this.globalParamPages = globalParamPages ? [...globalParamPages] : [];
		},

		// g2_get_perf_file-buf captures the G2's *live USB* form in memory and returns it as a hex
		// "data" string (same convention as get-patch). That form is not a valid file: each patch
		// carries 10 parameter variations where a file has 9 (N_USB_VARIATIONS vs N_VARIATIONS), and
		// the G2 rejects such a file if it is ever uploaded back. Converting through the parser and
		// serializer fixes this — serializePerformance emits 9 unconditionally — entirely in memory,
		// so the file is written once instead of captured-then-rewritten. Best-effort: if conversion
		// fails, the raw (unconverted) captured bytes are still written so the user gets a file, just
		// not guaranteed re-uploadable — same fallback behavior as before.
		async _saveCapturedPerfBytes(path: string, cliOutput: string): Promise<void> {
			const result = JSON.parse(cliOutput);
			const rawHex: string = result.data;
			const fileBytes = rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
			try {
				const { PatchParser, stripFileHeader } = await import('../parser/nmg2PatchParser');
				const { serializePerformance } = await import('../parser/nmg2PatchSerializer');
				const prf2 = new PatchParser(new Uint8Array(fileBytes).buffer).parsePrf2();
				if (!prf2) throw new Error('Failed to parse the captured performance');
				const convertedHex = serializePerformance(
					prf2.patches,
					stripFileHeader(fileBytes),
					prf2.patches.map((p) => extractVariations(p)),
					prf2.globalParamPages,
				);
				// Only the section bytes change: the file keeps its own header ([name][0x00][version]
				// [file type]) verbatim, so a long Clavia-style header survives the round-trip intact.
				const header = fileBytes.slice(0, fileBytes.indexOf(0) + 3);
				const sections = convertedHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
				await window.electronAPI.savePatch(path, [...header, ...sections]);
			} catch (err) {
				console.error('Failed to convert the captured performance to file form, saving raw capture instead:', err);
				await window.electronAPI.savePatch(path, fileBytes);
			}
		},

		async savePerformance(filepath?: string): Promise<void> {
			if (!this.performanceRawHex) {
				// Hardware-native performance mode (no .prf2 opened from disk/browser this
				// session, so there's no template to reserialize from) — pull the current
				// performance straight from the device instead. g2_get_perf_file does the
				// entire job itself (queries all 4 slots + perf settings, writes the .prf2).
				const device = useDeviceStore();
				if (!device.isHardwarePerformanceMode || device.status !== DeviceStatus.Connected) return;
				let hwPath = filepath || this.performanceFilePath;
				if (!hwPath) {
					//@ts-ignore
					const result = await window.electronAPI.showSavePerfDialog(this.performanceName || device.device?.performance?.name);
					if (!result.success || !result.filepath) return;
					hwPath = result.filepath;
				}
				try {
					const output = await window.cli.run(['get-perf-file-buf']);
					await this._saveCapturedPerfBytes(hwPath, output);
				} catch (err) {
					console.error('Failed to save performance:', err);
					showToast('Failed to save performance.');
					return;
				}
				this.performanceFilePath = hwPath;
				return;
			}
			let path = filepath || this.performanceFilePath;
			if (!path) {
				//@ts-ignore
				const result = await window.electronAPI.showSavePerfDialog(this.performanceName);
				if (!result.success || !result.filepath) return;
				path = result.filepath;
			}
			const { serializePerformance } = await import('../parser/nmg2PatchSerializer');
			const patches = (['A', 'B', 'C', 'D'] as SlotLabel[])
				.map((s) => {
					const e = this.slots[s];
					if (e.patch) {
						e.patch.controllers = [...e.controllers]; // sync edits (auto-CC, deletes) before serialize
						e.patch.paramPages = [...e.paramPages];
					}
					return e.patch!;
				})
				.filter(Boolean);
			if (patches.length !== 4) return;
			const variationsArray = (['A', 'B', 'C', 'D'] as SlotLabel[]).map((s) => this.slots[s].variations ?? []);
			const newRawHex = serializePerformance(patches, this.performanceRawHex, variationsArray, this.globalParamPages);
			const sectionBytes = newRawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
			const nameBytes = Array.from(new TextEncoder().encode(this.performanceName));
			// 0x17 = format version, 0x01 = file type "performance" (0x00 is a patch) — real .prf2
			// files carry 0x01 here. Our own loader detects a performance by its 0x11 section, but
			// other editors read this byte.
			const data = [...nameBytes, 0x00, 0x17, 0x01, ...sectionBytes];
			try {
				await window.electronAPI.savePatch(path, data);
			} catch (err) {
				console.error('Failed to save performance:', err);
				showToast('Failed to save performance.');
				return;
			}
			this.performanceFilePath = path;
			this.performanceRawHex = newRawHex;
			for (const s of ['A', 'B', 'C', 'D'] as SlotLabel[]) this.slots[s].edited = false;
		},

		// Shared by saveSlot/pushPatchToDevice: builds the .pch2 byte layout
		// ([nameBytes][0x00][0x17][0x00][sectionBytes]), re-serializing from templateRawHex only
		// if the cache was invalidated by an edit since the last serialize (or if forceReserialize
		// is set — see pushPatchToDevice: rawHex fetched straight from hardware via get-patch/
		// slot_data has NO trailing CRC (g2_get_patch's patch_usb_to_pch2 strips it on read), while
		// rawHex produced by serializePatch/buildRawHex DOES append one. g2_upload_patch always
		// strips the file's last 2 bytes assuming they're that CRC — uploading a cached,
		// never-locally-reserialized rawHex silently truncates 2 real bytes of patch data on the
		// device. forceReserialize bypasses the cache so the CRC-appending path always runs.
		async _buildPchBytes(entry: SlotEntry, forceReserialize = false): Promise<number[]> {
			if (!entry.rawHex || forceReserialize) {
				if (!entry.templateRawHex) throw new Error('No template rawHex to serialize from');
				const { serializePatch } = await import('../parser/nmg2PatchSerializer');
				entry.patch!.controllers = [...entry.controllers];
				entry.patch!.paramPages = [...entry.paramPages];
				entry.rawHex = serializePatch(entry.name, entry.patch!, entry.templateRawHex, entry.variations ?? []);
			}
			const sectionBytes = entry.rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
			const nameBytes = Array.from(new TextEncoder().encode(entry.name));
			return [...nameBytes, 0x00, 0x17, 0x00, ...sectionBytes];
		},

		async saveSlot(slot: SlotLabel, filepath?: string): Promise<void> {
			const entry = this.slots[slot];
			if (!entry?.patch) return;
			let path = filepath || this.slotFilePaths[slot];
			if (!path) {
				//@ts-ignore
				const result = await window.electronAPI.showSaveDialog(entry.name);
				if (!result.success || !result.filepath) return;
				path = result.filepath;
			}
			const ok = await this.exportSlotToFile(slot, path);
			if (!ok) return;
			this.slotFilePaths[slot] = path;
			entry.edited = false;
		},

		// Serializes and writes a slot's current patch to an arbitrary file path, without
		// touching slotFilePaths/edited — used for one-off snapshots (e.g. Save Init Patch)
		// that must not hijack what the next regular Save writes to. Returns whether the write succeeded.
		async exportSlotToFile(slot: SlotLabel, filepath: string): Promise<boolean> {
			const entry = this.slots[slot];
			if (!entry?.patch) return false;
			if (!entry.rawHex && !entry.templateRawHex) return false;
			try {
				const data = await this._buildPchBytes(entry);
				await window.electronAPI.savePatch(filepath, data);
				return true;
			} catch (err) {
				console.error(`Failed to save slot ${slot}:`, err);
				showToast('Failed to save patch.');
				return false;
			}
		},

		// Pushes the slot's current in-memory patch to the connected device via a full re-upload —
		// the only way patch notes reach hardware live (see setPatchText's comment). Reuses
		// uploadingFromFile so this never races usePatchFile.ts's own upload-patch calls.
		async pushPatchToDevice(slot: SlotLabel): Promise<boolean> {
			const entry = this.slots[slot];
			if (!entry?.patch) return false;
			if (!entry.textDirty) return false; // nothing to push — never re-upload an untouched slot
			const ok = await this._uploadSlotToDevice(slot, slot);
			if (ok) entry.textDirty = false;
			return ok;
		},

		// Shared by pushPatchToDevice and "Download to Slot": serializes the source slot's current
		// patch and uploads the bytes directly into the target slot of the connected synth.
		// forceReserialize is deliberate — see _buildPchBytes' CRC comment: never trust a cached
		// hardware-fetched rawHex.
		async _uploadSlotToDevice(source: SlotLabel, target: SlotLabel): Promise<boolean> {
			const entry = this.slots[source];
			if (!entry?.patch) return false;
			if (useDeviceStore().status !== DeviceStatus.Connected) return false;
			if (this.uploadingFromFile) return false;
			this.uploadingFromFile = true;
			try {
				const bytes = await this._buildPchBytes(entry, true);
				await window.cli.run(['upload-patch-data', target, bytes]);
				return true;
			} catch (err) {
				console.error(`Push slot ${source} to G2 slot ${target} failed:`, err);
				showToast('Failed to push patch to device — check connection.');
				return false;
			} finally {
				this.uploadingFromFile = false;
			}
		},

		// get-patch immediately after a patch upload can race the G2 still applying it internally,
		// returning a malformed response — g2_upload_perf's own post-upload settle delay and the
		// CLI's upload integration tests (which pause before querying a just-uploaded slot) hit the
		// same issue. Retry with backoff rather than guessing a single fixed delay.
		async _reloadSlotAfterUpload(slot: SlotLabel): Promise<void> {
			for (let attempt = 1; attempt <= 3; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
				if (await this.loadSlot(slot, true)) return;
			}
		},

		// Patch → "Download to Slot": push the current patch of `source` into `target` in the synth.
		// Reloads `target` from hardware afterward rather than relying on the patch_version_change/
		// resources_used watch-event pair — that reload trigger is only confirmed for in-app
		// structural edits (add/move/delete module or cable), not a wholesale slot upload like this.
		async downloadToSynthSlot(source: SlotLabel, target: SlotLabel): Promise<boolean> {
			const ok = await this._uploadSlotToDevice(source, target);
			if (ok) await this._reloadSlotAfterUpload(target);
			return ok;
		},

		// Performance → "Download": push the locally-authored performance (a .prf2 loaded while
		// working in local mode) to the connected synth via upload-perf-data. Requires a performance
		// template to reserialize from — re-uploads the in-memory edits, not the stale disk file.
		async downloadPerformanceToSynth(): Promise<boolean> {
			if (!this.performanceRawHex) {
				showToast('No local performance to download — load a .prf2 into the editor first.');
				return false;
			}
			const device = useDeviceStore();
			if (device.status !== DeviceStatus.Connected) return false;
			if (this.uploadingFromFile) return false;
			const patches = (['A', 'B', 'C', 'D'] as SlotLabel[])
				.map((s) => {
					const e = this.slots[s];
					if (e.patch) {
						e.patch.controllers = [...e.controllers];
						e.patch.paramPages = [...e.paramPages];
					}
					return e.patch!;
				})
				.filter(Boolean);
			if (patches.length !== 4) {
				showToast('Cannot download performance — not all slots contain a patch.');
				return false;
			}
			this.uploadingFromFile = true;
			try {
				// A performance upload only makes sense with the synth in Performance mode —
				// same precondition usePatchFile's applyPerformanceFile establishes before its
				// own upload-perf.
				await device.setPerformanceMode(this.performanceName);
				const { serializePerformance } = await import('../parser/nmg2PatchSerializer');
				const variationsArray = (['A', 'B', 'C', 'D'] as SlotLabel[]).map((s) => this.slots[s].variations ?? []);
				const newRawHex = serializePerformance(patches, this.performanceRawHex, variationsArray, this.globalParamPages);
				const sectionBytes = newRawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
				const nameBytes = Array.from(new TextEncoder().encode(this.performanceName));
				const data = [...nameBytes, 0x00, 0x17, 0x01, ...sectionBytes];
				await window.cli.run(['upload-perf-data', data]);
				// Same reasoning as downloadToSynthSlot: reload all 4 slots explicitly (with retry —
				// see _reloadSlotAfterUpload) rather than relying on the watch-event reload chain,
				// which isn't confirmed for a full upload. Sequentially, not in parallel — four
				// concurrent retry chains mean up to 12 get-patch calls racing a G2 that is still
				// applying the performance internally.
				for (const s of ['A', 'B', 'C', 'D'] as SlotLabel[]) await this._reloadSlotAfterUpload(s);
				return true;
			} catch (err) {
				console.error('Failed to download performance to G2:', err);
				showToast('Failed to download performance — check device connection.');
				return false;
			} finally {
				this.uploadingFromFile = false;
			}
		},

		async moveModulesWithCollision(
			indices: number[],
			dCol: number,
			dRow: number,
			area: 'voice' | 'fx',
			currentModuleList: any[],
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			if (indices.length === 0) return null;
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;
			const { getModule } = await import('../renderer/nmg2mods');
			const { areaIdx, location } = areaConfig(area);

			const movedSet = new Set(indices);
			const targets = indices
				.map((id) => {
					const m = currentModuleList.find((x: any) => x.index === id);
					if (!m) return null;
					const height = getModule(m.type)?.height ?? 2;
					return {
						index: id,
						fromCol: m.horiz as number,
						fromRow: m.vert as number,
						toCol: Math.max(0, (m.horiz as number) + dCol),
						toRow: Math.max(0, (m.vert as number) + dRow),
						height,
					};
				})
				.filter((t): t is { index: number; fromCol: number; fromRow: number; toCol: number; toRow: number; height: number } => t !== null);

			const occupantsByCol = new Map<number, { row: number; height: number }[]>();
			for (const t of targets) {
				if (!occupantsByCol.has(t.toCol)) occupantsByCol.set(t.toCol, []);
				occupantsByCol.get(t.toCol)!.push({ row: t.toRow, height: t.height });
			}

			const pushDowns: { index: number; col: number; newRow: number }[] = [];
			for (const [col, occupants] of occupantsByCol) {
				const stationary = currentModuleList
					.filter((m: any) => m.horiz === col && !movedSet.has(m.index))
					.map((m: any) => ({
						index: m.index as number,
						vert: m.vert as number,
						height: getModule(m.type)?.height ?? 2,
					}));
				for (const d of resolveColumnCollisions(stationary, occupants)) {
					pushDowns.push({ index: d.index, col, newRow: d.newRow });
				}
			}

			// Capture original positions before mutation
			const pushedBack = pushDowns.map((d) => {
				const orig = currentModuleList.find((m: any) => m.index === d.index);
				return { index: d.index, col: d.col, fromRow: orig?.vert ?? d.newRow, toRow: d.newRow };
			});

			for (const p of pushDowns) mutMoveModule(patch, areaIdx, p.index, p.col, p.newRow);
			for (const t of targets) mutMoveModule(patch, areaIdx, t.index, t.toCol, t.toRow);
			this._markSlotDirty(slot);

			const cliCmds: string[][] = [
				...pushDowns.map((p) => ['move-module', slot, location, String(p.index), String(p.col), String(p.newRow)]),
				...targets.map((t) => ['move-module', slot, location, String(t.index), String(t.toCol), String(t.toRow)]),
			];
			if (cliCmds.length > 0) {
				await runCliBatchSafe(cliCmds, 'moveModulesWithCollision');
			}

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						const undoCmds: string[][] = [];
						for (const m of pushedBack) {
							mutMoveModule(patch, areaIdx, m.index, m.col, m.fromRow);
							undoCmds.push(['move-module', slot, location, String(m.index), String(m.col), String(m.fromRow)]);
						}
						for (const t of targets) {
							mutMoveModule(patch, areaIdx, t.index, t.fromCol, t.fromRow);
							undoCmds.push(['move-module', slot, location, String(t.index), String(t.fromCol), String(t.fromRow)]);
						}
						this._markSlotDirty(slot);
						if (undoCmds.length > 0) {
							await runCliBatchSafe(undoCmds, 'moveModulesWithCollision undo');
						}
					},
					redo: async () => {
						const currentCtx = this._getActivePatch();
						if (currentCtx) {
							const currentMods = currentCtx.patch.areas[areaIdx].modules;
							await this.moveModulesWithCollision(indices, dCol, dRow, area, currentMods);
						}
					},
				});
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async dropModuleWithCollision(
			typeId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
			currentModuleList: any[],
		): Promise<{ name: string; rawHex: string; patch: Patch; moduleId: number } | null> {
			const hist = useHistoryStore();
			const slot = useUiStore().slotInFocus;
			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			try {
				const { getModule } = await import('../renderer/nmg2mods');
				const ids = currentModuleList.map((m: any) => m.index as number);
				// Redo relies on this ID being free; if the user adds a module after undoing, the same ID may be reused and redo will conflict.
				const moduleId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
				const height = getModule(typeId)?.height ?? 2;
				const colMods = currentModuleList
					.filter((m: any) => m.horiz === col)
					.map((m: any) => ({
						index: m.index as number,
						vert: m.vert as number,
						height: getModule(m.type)?.height ?? 2,
					}));
				const pushDowns = resolveColumnCollisions(colMods, [{ row, height }]);
				const movedBack = pushDowns.map((d) => {
					const orig = colMods.find((m) => m.index === d.index);
					return { index: d.index, col, fromRow: orig?.vert ?? d.newRow, toRow: d.newRow };
				});

				for (const d of pushDowns) {
					try {
						await this.moveModuleNoReload(d.index, col, d.newRow, area);
					} catch (e) {
						console.warn('[dropModuleWithCollision] move failed, proceeding with add:', e);
					}
				}
				const result = await this.addModule(typeId, moduleId, col, row, area);

				if (shouldRecord) {
					const { areaIdx } = areaConfig(area);
					const ctx = this._getActivePatch();
					const addedMod = ctx ? findModuleByIndex(ctx.patch.areas[areaIdx].modules, moduleId) : null;
					const modSnap = addedMod ? { ...addedMod, lv: [...addedMod.lv], modes: [...addedMod.modes] } : null;

					hist.record(slot, {
						undo: async () => {
							await this.deleteModule(moduleId, area);
							for (const m of movedBack) await this.moveModuleNoReload(m.index, m.col, m.fromRow, area);
						},
						redo: async () => {
							for (const m of movedBack) await this.moveModuleNoReload(m.index, m.col, m.toRow, area);
							if (modSnap) await this.addModuleWithData(modSnap, moduleId, col, row, area);
							else await this.addModule(typeId, moduleId, col, row, area);
						},
					});
				}

				return result ? { ...result, moduleId } : null;
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}
		},

		async setModuleColors(moduleIds: number[], color: number, area: 'voice' | 'fx'): Promise<void> {
			if (moduleIds.length === 0) return;
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const prevColors = moduleIds.map((id) => {
					const mod = findModuleByIndex(patch.areas[areaIdx].modules, id);
					return { id, prevColor: mod?.colour ?? color };
				});
				hist.record(slot, {
					undo: async () => {
						for (const { id, prevColor } of prevColors) {
							await this.setModuleColors([id], prevColor, area);
						}
					},
					redo: async () => {
						await this.setModuleColors(moduleIds, color, area);
					},
				});
			}

			for (const id of moduleIds) mutSetModuleColor(patch, areaIdx, id, color);
			this._markSlotDirty(slot);
			await runCliBatchSafe(
				moduleIds.map((id) => ['set-module-color', slot, location, String(id), String(color)]),
				'setModuleColors',
			);
		},

		async setModuleLabel(moduleId: number, label: string, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx].modules, moduleId);
				const prevLabel = mod?.uname ?? '';
				hist.record(slot, {
					undo: async () => {
						await this.setModuleLabel(moduleId, prevLabel, area);
					},
					redo: async () => {
						await this.setModuleLabel(moduleId, label, area);
					},
				});
			}

			mutSetModuleLabel(patch, areaIdx, moduleId, label);
			this._markSlotDirty(slot);
			await runCliSafe(['set-module-name', slot, location, String(moduleId), label], 'setModuleLabel');
		},

		// SeqNote's piano-roll Magnifier/Octave view — host-editor-only UI state with no wire-protocol
		// counterpart (see pianoRoll.ts), so unlike every other module-level setter above, there is no
		// CLI push here. It's still real patch data (persisted via the $PARAM_NAMES section, see
		// nmg2PatchSerializer.ts's paramLabelsForModule), so it still goes through history/dirty-marking
		// like any other edit. The G2's own onboard Rnd/Clr (pressed directly on the unit) randomizes
		// within *its own* stored zoom/offset window regardless of what's pushed here — see
		// useSlotEvents.ts's param_change handler, which corrects that by recomputing within the
		// window shown here as soon as it sees hardware's own Rnd/Clr press echo back.
		async setSeqNotePianoRollView(moduleId: number, area: 'voice' | 'fx', view: PianoRollView): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx].modules, moduleId);
				const prevView = mod?.pianoRollView ?? DEFAULT_PIANO_ROLL_VIEW;
				hist.record(slot, {
					undo: async () => {
						await this.setSeqNotePianoRollView(moduleId, area, prevView);
					},
					redo: async () => {
						await this.setSeqNotePianoRollView(moduleId, area, view);
					},
				});
			}

			mutSetPianoRollView(patch, areaIdx, moduleId, view);
			this._markSlotDirty(slot);
		},

		async setPatchName(name: string): Promise<void> {
			name = name.trim();
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot } = ctx;
			const prevName = this.slots[slot].name;
			if (prevName === name) return;
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => this.setPatchName(prevName),
					redo: async () => this.setPatchName(name),
				});
			}
			this.slots[slot].name = name;
			this._markSlotDirty(slot);
			if (useDeviceStore().status === DeviceStatus.Connected) {
				await window.cli.run(['set-patch-name', slot, name]);
			}
		},

		async setPatchDescription(): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx || !ctx.patch.description) return;
			const { slot, patch } = ctx;
			const description = patch.description!;
			this._markSlotDirty(slot);
			const templateHex = this.slots[slot].templateRawHex;
			if (!templateHex || useDeviceStore().status !== DeviceStatus.Connected) return;
			const { buildPatchDescriptionBytes } = await import('../parser/nmg2PatchSerializer');
			const bytes = buildPatchDescriptionBytes(templateHex, description);
			if (!bytes) return;
			const hex = Array.from(bytes)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			await window.cli.run(['set-patch-description', slot, hex]);
		},

		// Shared by PatchToolBar/SettingsPane (category, voice mode, voice count) and ui.ts's
		// setAreaFbar (area/split height): mutates one patch-description field and records undo,
		// coalesced per field+slot so a drag (height) collapses to one undo entry. Callers remain
		// responsible for pushing to hardware via setPatchDescription() — this only mutates + marks dirty.
		setPatchDescriptionField(field: 'category' | 'monopoly' | 'voices' | 'height', value: number): void {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const description = patch.description;
			if (!description) return;
			const prevValue = description[field];
			if (prevValue === value) return;
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const box = { initial: prevValue, latest: value };
				hist.record(
					slot,
					{
						undo: async () => {
							this.setPatchDescriptionField(field, box.initial);
							await this.setPatchDescription();
						},
						redo: async () => {
							this.setPatchDescriptionField(field, box.latest);
							await this.setPatchDescription();
						},
					},
					`patchdesc:${field}:${slot}`,
					box,
				);
			}
			description[field] = value;
			this._markSlotDirty(slot);
		},

		// Local edit only — the G2 protocol has no live "set patch notes" command (confirmed
		// against three independent sources, including a real hang on actual hardware). Notes
		// reach the device via a full patch re-upload — see `pushPatchToDevice`, triggered by
		// TextPane.vue when the notes pane loses visibility or via its explicit "Save now" button,
		// same approach chrispurusha/G2-Edit uses. Takes an explicit slot (not the currently-focused
		// one) so a slot switch right after a keystroke can't write a stale edit into the wrong slot.
		setPatchText(slot: SlotLabel, text: string): void {
			const entry = this.slots[slot];
			const patch = entry?.patch;
			if (!patch) return;
			const prevText = patch.text ?? '';
			if (prevText === text) return;
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const box = { initial: prevText, latest: text };
				hist.record(
					slot,
					{
						undo: async () => this.setPatchText(slot, box.initial as string),
						redo: async () => this.setPatchText(slot, box.latest as string),
					},
					`text:${slot}`,
					box,
				);
			}
			patch.text = text;
			this._markSlotDirty(slot);
			entry.textDirty = true;
		},

		setMorphParam(variation: number, morphIdx: number, field: 'dial' | 'mode', value: number): void {
			const slot = useUiStore().slotInFocus;
			const entry = this.slots[slot];
			if (!entry?.variations?.[variation]) return;

			const patch = entry.variations[variation].patch;
			const prevValue = field === 'dial' ? patch.morphDials[morphIdx] : patch.morphModes[morphIdx];

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `morph:${variation}:${morphIdx}:${field}`;
				const box = { initial: prevValue, latest: value };
				hist.record(
					slot,
					{
						undo: () => {
							this.setMorphParam(variation, morphIdx, field, box.initial);
							return Promise.resolve();
						},
						redo: () => {
							this.setMorphParam(variation, morphIdx, field, box.latest);
							return Promise.resolve();
						},
					},
					cKey,
					box,
				);
			}

			if (field === 'dial') patch.morphDials[morphIdx] = value;
			else patch.morphModes[morphIdx] = value;
			this._markSlotDirty(slot);
			const param = field === 'dial' ? morphIdx : 8 + morphIdx;
			sendCoalesced(`${slot}:patch:1:${param}:${variation}`, ['set-param', slot, 'patch', '1', String(param), String(value), String(variation)]);
		},

		getMorphAssignments(slot: SlotLabel, variation: number): MorphAssignment[] {
			return this.slots[slot]?.variations?.[variation]?.patch.morphAssignments ?? [];
		},

		// Diffs two morphAssignments arrays (by groupIndex+location+moduleIndex+paramIndex) and pushes
		// the deltas to hardware in one set-morph-range-batch call: entries present in `from` but not
		// `to` are deassigned (range forced to 0), entries present in `to` are (re-)assigned at their
		// stored range. No-op while offline.
		async _resyncMorphAssignments(slot: SlotLabel, variation: number, from: MorphAssignment[], to: MorphAssignment[]): Promise<void> {
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return;
			const tupleKey = (a: MorphAssignment) => `${a.groupIndex}:${a.location}:${a.moduleIndex}:${a.paramIndex}`;
			const toKeys = new Set(to.map(tupleKey));
			const removed = from.filter((a) => !toKeys.has(tupleKey(a))).map((a) => ({ ...a, range: 0 }));
			const ops = [...removed, ...to];
			if (ops.length === 0) return;
			const flatArgs = ops.flatMap((a) => [
				locationStr01(a.location),
				String(a.moduleIndex),
				String(a.paramIndex),
				String(a.range),
				String(a.groupIndex),
				String(variation),
			]);
			await window.cli.run(['set-morph-range-batch', slot, ...flatArgs]);
		},

		// Shared plumbing for assign/deassign/clear/copy below, which all replace the whole
		// `morphAssignments` array in one step: mutates via `mutate`, marks the slot dirty, pushes the
		// diff to hardware (see _resyncMorphAssignments), and (unless history is locked) records an
		// undo that restores the previous array and resyncs hardware back to it too.
		_mutateMorphAssignments(slot: SlotLabel, variation: number, mutate: (prev: MorphAssignment[]) => MorphAssignment[], redo: () => Promise<void>): void {
			const vState = this.slots[slot]?.variations?.[variation];
			if (!vState) return;
			const patch = vState.patch;
			const prevAssignments = patch.morphAssignments;
			const nextAssignments = mutate(prevAssignments);
			patch.morphAssignments = nextAssignments;
			this._markSlotDirty(slot);
			void this._resyncMorphAssignments(slot, variation, prevAssignments, nextAssignments);
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						const v2 = this.slots[slot]?.variations?.[variation];
						const current = v2?.patch.morphAssignments ?? [];
						if (v2) v2.patch.morphAssignments = prevAssignments;
						this._markSlotDirty(slot);
						await this._resyncMorphAssignments(slot, variation, current, prevAssignments);
					},
					redo,
				});
			}
		},

		// A param may be assigned to several morph groups at once, so this only dedupes on the exact
		// (groupIndex, location, moduleIndex, paramIndex) tuple, unlike assignMidiCC's dedupe-by-cc.
		async assignParamToMorphGroup(
			slot: SlotLabel,
			variation: number,
			groupIndex: number,
			location: 0 | 1,
			moduleIndex: number,
			paramIndex: number,
			range: number,
		): Promise<void> {
			const isSame = (a: MorphAssignment) =>
				a.groupIndex === groupIndex && a.location === location && a.moduleIndex === moduleIndex && a.paramIndex === paramIndex;
			this._mutateMorphAssignments(
				slot,
				variation,
				(prev) => [...prev.filter((a) => !isSame(a)), { groupIndex, location, moduleIndex, paramIndex, range }],
				() => this.assignParamToMorphGroup(slot, variation, groupIndex, location, moduleIndex, paramIndex, range),
			);
		},

		async deassignParamFromMorphGroup(
			slot: SlotLabel,
			variation: number,
			groupIndex: number,
			location: 0 | 1,
			moduleIndex: number,
			paramIndex: number,
		): Promise<void> {
			this._mutateMorphAssignments(
				slot,
				variation,
				(prev) =>
					prev.filter(
						(a) => !(a.groupIndex === groupIndex && a.location === location && a.moduleIndex === moduleIndex && a.paramIndex === paramIndex),
					),
				() => this.deassignParamFromMorphGroup(slot, variation, groupIndex, location, moduleIndex, paramIndex),
			);
		},

		async setMorphAssignmentRange(
			slot: SlotLabel,
			variation: number,
			groupIndex: number,
			location: 0 | 1,
			moduleIndex: number,
			paramIndex: number,
			range: number,
		): Promise<void> {
			const vState = this.slots[slot]?.variations?.[variation];
			if (!vState) return;
			const patch = vState.patch;
			const idx = patch.morphAssignments.findIndex(
				(a) => a.groupIndex === groupIndex && a.location === location && a.moduleIndex === moduleIndex && a.paramIndex === paramIndex,
			);
			if (idx === -1) return; // not assigned — caller must assign first
			const prevRange = patch.morphAssignments[idx].range;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `morphrange:${variation}:${groupIndex}:${location}:${moduleIndex}:${paramIndex}`;
				const box = { initial: prevRange, latest: range };
				hist.record(
					slot,
					{
						undo: async () => {
							await this.setMorphAssignmentRange(slot, variation, groupIndex, location, moduleIndex, paramIndex, box.initial);
						},
						redo: async () => {
							await this.setMorphAssignmentRange(slot, variation, groupIndex, location, moduleIndex, paramIndex, box.latest);
						},
					},
					cKey,
					box,
				);
			}

			const list = patch.morphAssignments;
			patch.morphAssignments = [...list.slice(0, idx), { ...list[idx], range }, ...list.slice(idx + 1)];
			this._markSlotDirty(slot);
			const key = `${slot}:morph:${variation}:${groupIndex}:${location}:${moduleIndex}:${paramIndex}`;
			sendCoalesced(key, setMorphRangeCmd(slot, location, moduleIndex, paramIndex, range, groupIndex, variation));
		},

		// Deassigns everything from one morph group (toolbar right-click "Clear").
		async clearMorphGroup(slot: SlotLabel, variation: number, groupIndex: number): Promise<void> {
			this._mutateMorphAssignments(
				slot,
				variation,
				(prev) => prev.filter((a) => a.groupIndex !== groupIndex),
				() => this.clearMorphGroup(slot, variation, groupIndex),
			);
		},

		// Copies all assignments+ranges from one morph group to another, replacing the destination
		// group's existing assignments (toolbar right-click "Copy To | Group X").
		async copyMorphGroup(slot: SlotLabel, variation: number, fromGroupIndex: number, toGroupIndex: number): Promise<void> {
			if (fromGroupIndex === toGroupIndex) return;
			this._mutateMorphAssignments(
				slot,
				variation,
				(prev) => {
					const copied = prev.filter((a) => a.groupIndex === fromGroupIndex).map((a) => ({ ...a, groupIndex: toGroupIndex }));
					return [...prev.filter((a) => a.groupIndex !== toGroupIndex), ...copied];
				},
				() => this.copyMorphGroup(slot, variation, fromGroupIndex, toGroupIndex),
			);
		},

		async setPatchParam(variation: number, key: keyof PatchParamVariation, value: number): Promise<void> {
			const slot = useUiStore().slotInFocus;
			const entry = this.slots[slot];

			const prevValue = (entry?.variations?.[variation]?.patch?.[key] as number | undefined) ?? value;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `patchparam:${variation}:${key}`;
				const box = { initial: prevValue, latest: value };
				hist.record(
					slot,
					{
						undo: async () => {
							await this.setPatchParam(variation, key, box.initial);
						},
						redo: async () => {
							await this.setPatchParam(variation, key, box.latest);
						},
					},
					cKey,
					box,
				);
			}

			if (entry?.variations?.[variation]) {
				(entry.variations[variation].patch as Record<keyof PatchParamVariation, number | number[] | MorphAssignment[]>)[key] = value;
				this._markSlotDirty(slot);
			}
			const paramIdx = PATCH_PARAM_KEYS.indexOf(key);
			if (paramIdx < 0) return;
			// Convert global index to section + local index (inverse of SECTION_OFFSETS in useSlotEvents.ts)
			let section = 2,
				local = paramIdx;
			for (let i = 0; i < SECTION_STARTS.length - 1; i++) {
				if (paramIdx >= SECTION_STARTS[i].start && paramIdx < SECTION_STARTS[i + 1].start) {
					section = SECTION_STARTS[i].section;
					local = paramIdx - SECTION_STARTS[i].start;
					break;
				}
			}
			sendCoalesced(`${slot}:patch:${section}:${local}:${variation}`, [
				'set-param',
				slot,
				'patch',
				String(section),
				String(local),
				String(value),
				String(variation),
			]);
		},

		async setParamLabel(moduleIndex: number, paramIndex: number, label: string, area: 'voice' | 'fx', labelIndex = 0): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleIndex);
				const existingLabel = mod?.paramLabels?.find((pl) => pl.paramIndex === paramIndex);
				const prevLabel = existingLabel?.labels?.[labelIndex] ?? '';
				hist.record(slot, {
					undo: async () => {
						await this.setParamLabel(moduleIndex, paramIndex, prevLabel, area, labelIndex);
					},
					redo: async () => {
						await this.setParamLabel(moduleIndex, paramIndex, label, area, labelIndex);
					},
				});
			}

			const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleIndex);
			if (!mod) return;
			if (!mod.paramLabels) mod.paramLabels = [];
			let entry = mod.paramLabels.find((pl) => pl.paramIndex === paramIndex);
			// Positions other than labelIndex have never been customized, so pad with the
			// param's default names instead of '' — an explicit '' renders as a blank button
			// (see useSwitch.ts's displayNames, which only falls back to the default for
			// undefined entries, not empty strings).
			const defaultNames = getModule(mod.type)?.params?.[paramIndex]?.type ? getParam(getModule(mod.type)!.params![paramIndex].type)?.names : undefined;
			if (!entry) {
				const labels = Array.from({ length: labelIndex + 1 }, (_, i) => (i === labelIndex ? label : (defaultNames?.[i] ?? '')));
				entry = { paramIndex, isString: false, paramLen: 1 + labels.length * 7, labels };
				mod.paramLabels.push(entry);
			} else {
				while (entry.labels.length <= labelIndex) entry.labels.push(defaultNames?.[entry.labels.length] ?? '');
				entry.labels[labelIndex] = label;
			}
			this._markSlotDirty(slot);
			await runCliSafe(['set-param-label', slot, location, String(moduleIndex), String(paramIndex), ...entry.labels], 'setParamLabel');
		},

		// Morph Group knob labels: on real hardware these are just parameter labels (8-15) of the
		// fixed PATCH_MORPH pseudo-module (location=2/"patch") — same $PARAM_NAMES/set-param-label
		// mechanism as setParamLabel above, decoupled from morph modulation assignments.
		async setMorphGroupLabel(groupIndex: number, label: string): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const paramIndex = 8 + groupIndex;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const prevLabel = patch.morphParamLabels?.find((pl) => pl.paramIndex === paramIndex)?.labels?.[0] ?? '';
				hist.record(slot, {
					undo: async () => {
						await this.setMorphGroupLabel(groupIndex, prevLabel);
					},
					redo: async () => {
						await this.setMorphGroupLabel(groupIndex, label);
					},
				});
			}

			if (!patch.morphParamLabels) patch.morphParamLabels = [];
			let entry = patch.morphParamLabels.find((pl) => pl.paramIndex === paramIndex);
			if (!entry) {
				// isString: true matches how the real hardware encodes morph group labels
				// (confirmed from a shipped .pch2's own $PARAM_NAMES(areaIdx=2) section).
				entry = { paramIndex, isString: true, paramLen: 8, labels: [label] };
				patch.morphParamLabels.push(entry);
			} else {
				entry.labels[0] = label;
			}
			this._markSlotDirty(slot);
			await runCliSafe(['set-param-label', slot, 'patch', String(PATCH_MORPH_MODULE_ID), String(paramIndex), label], 'setMorphGroupLabel');
		},

		async setCableColor(moduleIndex: number, connectorIndex: number, type: 'input' | 'output', color: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => matchesCableJack(c, moduleIndex, connectorIndex, type));
			if (matching.length === 0) return;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const prevColorMap = matching.map((c) => ({ ...c }));
				hist.record(slot, {
					undo: async () => {
						patch.areas[areaIdx].cableList = (patch.areas[areaIdx].cableList ?? []).map((c) => {
							const orig = prevColorMap.find((b) => b.smod === c.smod && b.scon === c.scon && b.dmod === c.dmod && b.dcon === c.dcon);
							// Restore both colour and userColour (orig was captured before the user-set)
							return orig ? { ...c, colour: orig.colour, userColour: orig.userColour } : c;
						});
						this._markSlotDirty(slot);
						await runCliBatchSafe(
							prevColorMap.map((b) => [
								'set-cable-color',
								slot,
								location,
								String(b.colour),
								String(b.smod),
								(b.dir ?? 1) === 0 ? '0' : '1',
								String(b.scon),
								String(b.dmod),
								'0',
								String(b.dcon),
							]),
							'setCableColor undo',
						);
					},
					redo: async () => {
						await this.setCableColor(moduleIndex, connectorIndex, type, color, area);
					},
				});
			}

			// userColour marks this as an explicit user override so auto-recolor skips it.
			patch.areas[areaIdx].cableList = cableList.map((c) => (matching.includes(c) ? { ...c, colour: color, userColour: color } : c));
			this._markSlotDirty(slot);
			await runCliBatchSafe(
				matching.map((c) => [
					'set-cable-color',
					slot,
					location,
					String(color),
					String(c.smod),
					(c.dir ?? 1) === 0 ? '0' : '1',
					String(c.scon),
					String(c.dmod),
					'0',
					String(c.dcon),
				]),
				'setCableColor',
			);
		},

		async deleteConnectedCables(moduleIndex: number, connectorIndex: number, type: 'input' | 'output', area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => matchesCableJack(c, moduleIndex, connectorIndex, type));
			if (matching.length === 0) return;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const deletedCables = matching.map((c) => ({ ...c }));
				hist.record(slot, {
					undo: async () => {
						for (const c of deletedCables) mutAddCable(patch, areaIdx, c);
						this._markSlotDirty(slot);
						await runCliBatchSafe(
							deletedCables.map((c) => addCableCmd(slot, location, c)),
							'deleteConnectedCables undo',
						);
					},
					redo: async () => {
						await this.deleteConnectedCables(moduleIndex, connectorIndex, type, area);
					},
				});
			}

			for (const c of matching) mutDeleteCable(patch, areaIdx, c);
			this._markSlotDirty(slot);
			await runCliBatchSafe(
				matching.map((c) => delCableCmd(slot, location, c)),
				'deleteConnectedCables',
			);
			this._syncUprateAndColors(patch, areaIdx);
		},

		// Shared by breakJackConnection/moveCableGroup: replaces oldCables with newCables as one undoable step.
		async _swapCables(
			slot: SlotLabel,
			patch: Patch,
			areaIdx: 0 | 1,
			location: 'va' | 'fx',
			oldCables: Cable[],
			newCables: Cable[],
			redo: () => Promise<void>,
		): Promise<void> {
			const buildDelCmds = (cables: Cable[]) => cables.map((c) => delCableCmd(slot, location, c));
			const buildAddCmds = (cables: Cable[]) => cables.map((c) => addCableCmd(slot, location, c));

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const deletedCables = oldCables.map((c) => ({ ...c }));
				const addedCables = newCables.map((c) => ({ ...c }));
				hist.record(slot, {
					undo: async () => {
						for (const c of addedCables) mutDeleteCable(patch, areaIdx, c);
						for (const c of deletedCables) mutAddCable(patch, areaIdx, c);
						this._markSlotDirty(slot);
						await runCliBatchSafe([...buildDelCmds(addedCables), ...buildAddCmds(deletedCables)], '_swapCables undo');
						this._syncUprateAndColors(patch, areaIdx);
					},
					redo,
				});
			}

			for (const c of oldCables) mutDeleteCable(patch, areaIdx, c);
			for (const c of newCables) mutAddCable(patch, areaIdx, { ...c });
			this._markSlotDirty(slot);

			await runCliBatchSafe([...buildDelCmds(oldCables), ...buildAddCmds(newCables)], '_swapCables');

			this._syncUprateAndColors(patch, areaIdx);
		},

		// Removes a jack from a multi-cable connection, splicing its remaining neighbors together
		// instead of deleting the whole connection (see deleteConnectedCables for that behavior).
		async breakJackConnection(moduleIndex: number, connectorIndex: number, type: 'input' | 'output', area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => matchesCableJack(c, moduleIndex, connectorIndex, type));
			if (matching.length === 0) return;

			if (matching.length === 1) {
				return this.deleteConnectedCables(moduleIndex, connectorIndex, type, area);
			}

			// The one cable (if any) driving this jack from an output; every other matched cable is a "neighbor" to splice.
			const incoming = matching.find((c) => (c.dir ?? 1) === 1 && c.dmod === moduleIndex && c.dcon === connectorIndex) ?? null;
			const others = matching
				.filter((c) => c !== incoming)
				.map((c) => (c.smod === moduleIndex && c.scon === connectorIndex ? { mod: c.dmod, con: c.dcon } : { mod: c.smod, con: c.scon }));

			const newCables: typeof matching = [];
			if (incoming) {
				// Star topology: splice the incoming source directly to each downstream neighbor.
				for (const o of others) {
					newCables.push({
						colour: incoming.colour,
						userColour: incoming.userColour,
						smod: incoming.smod,
						scon: incoming.scon,
						dir: 1,
						dmod: o.mod,
						dcon: o.con,
					});
				}
			} else {
				// No driving source (e.g. an output fanning directly to several inputs): chain the orphaned neighbors together.
				const colour = matching[0].colour;
				const userColour = matching[0].userColour;
				for (let i = 0; i < others.length - 1; i++) {
					newCables.push({ colour, userColour, dir: 0, smod: others[i].mod, scon: others[i].con, dmod: others[i + 1].mod, dcon: others[i + 1].con });
				}
			}

			await this._swapCables(slot, patch, areaIdx, location, matching, newCables, () =>
				this.breakJackConnection(moduleIndex, connectorIndex, type, area),
			);
		},

		// Relocates a group of cables (all sharing the same jack) from one jack to another, as a single undoable step.
		async moveCableGroup(
			cables: Cable[],
			fromJack: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' },
			toJack: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' },
			area: 'voice' | 'fx',
		): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			if (cables.length === 0) return;

			const newCables = cables.map((c) => {
				if (isCableSourceEnd(c, fromJack)) return { ...c, smod: toJack.moduleIndex, scon: toJack.connectorIndex };
				return { ...c, dmod: toJack.moduleIndex, dcon: toJack.connectorIndex };
			});

			await this._swapCables(slot, patch, areaIdx, location, cables, newCables, () => this.moveCableGroup(cables, fromJack, toJack, area));
		},

		updateResources(slot: SlotLabel, data: number[]): void {
			const applyBlock = (o: number) => {
				if (data.length < o + 28) return;
				const loc = data[o];
				const metrics = { cycles: parseResourceCycles(data, o), memory: parseResourceMemory(data, o) };
				if (loc === 1) this.slots[slot].resources.va = metrics;
				else if (loc === 0) this.slots[slot].resources.fx = metrics;
			};
			applyBlock(0);
			// Compound packet: 0x72 sub-command marker at offset 28 → second block at offset 29
			if (data.length >= 57 && data[28] === 0x72) applyBlock(29);
		},

		async deleteSelection(
			selectedModules: number[],
			selectedCables: Cable[],
			area: 'voice' | 'fx',
			currentModuleList: any[],
			currentCableList: any[],
		): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const hist = useHistoryStore();
			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			try {
				// Capture pre-state for history
				let modSnaps: ModuleInstance[] = [];
				let cableSnaps: Cable[] = [];
				let pagesSnaps: ParamPageAssignment[] = [];
				let globalPagesSnaps: GlobalParamPageAssignment[] = [];

				if (shouldRecord) {
					const areaKey = areaIdx === 0 ? 'fx' : 'voice';
					if (selectedModules.length > 0 && selectedCables.length === 0) {
						for (const id of selectedModules) {
							const mod = findModuleByIndex(patch.areas[areaIdx].modules, id);
							if (!mod) continue;
							const pcnt = mod.pcnt;
							const numVar = this.slots[slot].variations?.length ?? 1;
							const lvSnap = Array(pcnt * numVar).fill(0);
							for (let v = 0; v < numVar; v++) {
								const varParams = this.slots[slot].variations?.[v]?.[areaKey]?.[id] ?? [];
								for (let p = 0; p < pcnt; p++) lvSnap[v * pcnt + p] = varParams[p] ?? 0;
							}
							modSnaps.push({ ...mod, lv: lvSnap, modes: [...mod.modes] } as ModuleInstance);
						}
						cableSnaps = (patch.areas[areaIdx].cableList ?? [])
							.filter((c) => selectedModules.includes(c.smod) || selectedModules.includes(c.dmod))
							.map((c) => ({ ...c }) as Cable);
					} else if (selectedCables.length > 0) {
						cableSnaps = selectedCables.map((c) => ({ ...c }) as Cable);
					}
				}

				if (selectedModules.length > 0 && selectedCables.length === 0) {
					const cliCmds: string[][] = [];
					const deletedCableKeys = new Set<string>();
					for (const id of selectedModules) {
						for (const c of currentCableList.filter((c: any) => c.smod === id || c.dmod === id)) {
							const key = `${c.smod}-${c.scon}-${c.dmod}-${c.dcon}`;
							if (!deletedCableKeys.has(key)) {
								deletedCableKeys.add(key);
								mutDeleteCable(patch, areaIdx, c);
								cliCmds.push([
									'del-cable',
									slot,
									location,
									String(c.smod),
									c.dir === 0 ? '0' : '1',
									String(c.scon),
									String(c.dmod),
									'0',
									String(c.dcon),
								]);
							}
						}
						mutDeleteModule(patch, areaIdx, id);
						removeModuleFromVariations(this.slots[slot].variations, id, areaIdx === 0 ? 'fx' : 'voice');
						cliCmds.push(['del-module', slot, location, String(id)]);
					}
					const pageLocation = areaIdx === 0 ? 0 : 1;
					pagesSnaps = this.slots[slot].paramPages.filter((k) => k.location === pageLocation && selectedModules.includes(k.moduleIndex));
					if (pagesSnaps.length > 0) {
						this.slots[slot].paramPages = this.slots[slot].paramPages.filter(
							(k) => !(k.location === pageLocation && selectedModules.includes(k.moduleIndex)),
						);
						for (const p of pagesSnaps) cliCmds.push(['deassign-knob', slot, String(p.slotIndex)]);
					}
					globalPagesSnaps = this.globalParamPages.filter(
						(k) => k.slot === slot && k.location === pageLocation && selectedModules.includes(k.moduleIndex),
					);
					if (globalPagesSnaps.length > 0) {
						this.globalParamPages = this.globalParamPages.filter(
							(k) => !(k.slot === slot && k.location === pageLocation && selectedModules.includes(k.moduleIndex)),
						);
						for (const p of globalPagesSnaps) cliCmds.push(['deassign-global-knob', slot, String(p.slotIndex)]);
					}
					this._markSlotDirty(slot);
					if (cliCmds.length > 0) {
						await runCliBatchSafe(cliCmds, 'deleteSelection');
					}
				} else if (selectedCables.length > 0) {
					const cliCmds: string[][] = [];
					for (const cable of selectedCables) {
						const smod = cable.smod!;
						const scon = cable.scon!;
						const dmod = cable.dmod!;
						const dcon = cable.dcon!;
						mutDeleteCable(patch, areaIdx, { smod, scon, dmod, dcon });
						cliCmds.push(['del-cable', slot, location, String(smod), cable.dir === 0 ? '0' : '1', String(scon), String(dmod), '0', String(dcon)]);
					}
					this._markSlotDirty(slot);
					if (cliCmds.length > 0) {
						await runCliBatchSafe(cliCmds, 'deleteSelection');
					}
				}

				this._syncUprateAndColors(patch, areaIdx);

				if (shouldRecord) {
					const areaKey = areaIdx === 0 ? 'fx' : 'voice';
					hist.record(slot, {
						undo: async () => {
							for (const mod of modSnaps) {
								mutAddModule(patch, areaIdx, { ...mod, lv: [...mod.lv], modes: [...mod.modes] });
								const slotE = this.slots[slot];
								if (slotE.variations) {
									for (let v = 0; v < slotE.variations.length; v++) {
										const start = v * mod.pcnt;
										slotE.variations[v][areaKey][mod.index] = mod.lv.slice(start, start + mod.pcnt);
									}
								}
							}
							for (const c of cableSnaps) mutAddCable(patch, areaIdx, { ...c, dir: c.dir ?? 1 });
							if (pagesSnaps.length > 0) this.slots[slot].paramPages = [...this.slots[slot].paramPages, ...pagesSnaps];
							if (globalPagesSnaps.length > 0) this.globalParamPages = [...this.globalParamPages, ...globalPagesSnaps];
							this._markSlotDirty(slot);
							const allCmds: string[][] = [];
							for (const mod of modSnaps) {
								const paramVals0 = mod.lv.slice(0, mod.pcnt);
								allCmds.push([
									'add-module',
									slot,
									location,
									String(mod.type),
									String(mod.index),
									String(mod.horiz),
									String(mod.vert),
									String(mod.colour),
									String(mod.modes.length),
									...mod.modes.map(String),
									String(mod.pcnt),
									...paramVals0.map(String),
									mod.uname ?? '',
								]);
								const slotE = this.slots[slot];
								if (slotE.variations) {
									for (let v = 1; v < slotE.variations.length; v++) {
										for (let p = 0; p < mod.pcnt; p++) {
											const val = mod.lv[v * mod.pcnt + p];
											if (val !== undefined && val !== paramVals0[p])
												allCmds.push(['set-param', slot, location, String(mod.index), String(p), String(val), String(v)]);
										}
									}
								}
							}
							for (const c of cableSnaps) {
								const cn = { ...c, dir: c.dir ?? 1 };
								allCmds.push([
									'add-cable',
									slot,
									location,
									String(cn.colour),
									String(cn.smod),
									cn.dir === 0 ? '0' : '1',
									String(cn.scon),
									String(cn.dmod),
									'0',
									String(cn.dcon),
								]);
							}
							for (const p of pagesSnaps) allCmds.push(assignKnobCmd(slot, p));
							for (const p of globalPagesSnaps) allCmds.push(assignGlobalKnobCmd(slot, p));
							try {
								for (let i = 0; i < allCmds.length; i += BATCH_CHUNK) {
									await window.cli.runBatch(allCmds.slice(i, i + BATCH_CHUNK));
								}
							} catch (err) {
								console.warn('deleteSelection undo: CLI failed (offline?):', err);
							}
						},
						redo: async () => {
							const currentCtx = this._getActivePatch();
							if (currentCtx) {
								const currentMods = currentCtx.patch.areas[areaIdx].modules;
								const currentCables = currentCtx.patch.areas[areaIdx].cableList ?? [];
								await this.deleteSelection(selectedModules, selectedCables, area, currentMods, currentCables);
							}
						},
					});
				}
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}
		},

		async undo(): Promise<void> {
			const slot = useUiStore().slotInFocus;
			const hist = useHistoryStore();
			const entry = hist.popUndo(slot);
			if (!entry) return;
			hist.lock(slot);
			try {
				await entry.undo();
				// Back to the load/save baseline once the undo stack is empty — clear the
				// dirty flag. Known limitation: a save partway through history isn't tracked,
				// so this only fires on a fully empty stack (see plan/memory for details).
				if (!hist.canUndo(slot)) this.slots[slot].edited = false;
			} catch (err) {
				console.warn('[undo] CLI failed (offline?):', err);
				hist.restoreUndo(slot, entry);
			} finally {
				hist.unlock(slot);
			}
		},

		async redo(): Promise<void> {
			const slot = useUiStore().slotInFocus;
			const hist = useHistoryStore();
			const entry = hist.popRedo(slot);
			if (!entry) return;
			hist.lock(slot);
			try {
				await entry.redo();
			} catch (err) {
				console.warn('[redo] CLI failed (offline?):', err);
				hist.restoreRedo(slot, entry);
			} finally {
				hist.unlock(slot);
			}
		},

		async assignMidiCC(slot: SlotLabel, location: 0 | 1 | 2, moduleIndex: number, paramIndex: number, cc: number): Promise<void> {
			const locStr = ccLocationStr(location);
			const prevControllers = [...this.slots[slot].controllers];
			this.slots[slot].controllers = [...this.slots[slot].controllers.filter((c) => c.cc !== cc), { cc, location, moduleIndex, paramIndex }];
			this._markSlotDirty(slot);
			if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...this.slots[slot].controllers];
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						this.slots[slot].controllers = prevControllers;
						this._markSlotDirty(slot);
						if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...prevControllers];
						const deviceStore = useDeviceStore();
						if (deviceStore.status === DeviceStatus.Connected) {
							const oldAssignment = prevControllers.find((c) => c.cc === cc);
							if (oldAssignment) {
								const oldLocStr = ccLocationStr(oldAssignment.location);
								await window.cli.run([
									'assign-midicc',
									slot,
									oldLocStr,
									String(oldAssignment.moduleIndex),
									String(oldAssignment.paramIndex),
									String(cc),
								]);
							} else {
								await window.cli.run(['deassign-midicc', slot, String(cc)]);
							}
						}
					},
					redo: async () => {
						await this.assignMidiCC(slot, location, moduleIndex, paramIndex, cc);
					},
				});
			}
			const deviceStore = useDeviceStore();
			if (deviceStore.status === DeviceStatus.Connected)
				await window.cli.run(['assign-midicc', slot, locStr, String(moduleIndex), String(paramIndex), String(cc)]);
		},

		async deassignMidiCC(slot: SlotLabel, cc: number): Promise<void> {
			const prevControllers = [...this.slots[slot].controllers];
			this.slots[slot].controllers = this.slots[slot].controllers.filter((c) => c.cc !== cc);
			this._markSlotDirty(slot);
			if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...this.slots[slot].controllers];
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						this.slots[slot].controllers = prevControllers;
						this._markSlotDirty(slot);
						if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...prevControllers];
						const restored = prevControllers.find((c) => c.cc === cc);
						if (restored) {
							const deviceStore = useDeviceStore();
							if (deviceStore.status === DeviceStatus.Connected) {
								const locStr = ccLocationStr(restored.location);
								await window.cli.run(['assign-midicc', slot, locStr, String(restored.moduleIndex), String(restored.paramIndex), String(cc)]);
							}
						}
					},
					redo: async () => {
						await this.deassignMidiCC(slot, cc);
					},
				});
			}
			const deviceStore = useDeviceStore();
			if (deviceStore.status === DeviceStatus.Connected) await window.cli.run(['deassign-midicc', slot, String(cc)]);
		},

		// Assigns a module parameter to a Parameter Page knob slot (0-119). Enforces two-way
		// uniqueness like the real hardware/reference editor (BVE.NMG2Mess.pas's
		// CreateAssignKnobMessage): if slotIndex already holds a different param, that old
		// occupant is evicted; if this param already occupies a different slot, that old slot is
		// cleared too. Both changes land in one undo entry.
		async assignParamToPage(slot: SlotLabel, slotIndex: number, location: 0 | 1, moduleIndex: number, paramIndex: number): Promise<void> {
			const prev = [...this.slots[slot].paramPages];
			const entry: ParamPageAssignment = { slotIndex, location, moduleIndex, paramIndex, isLed: 0 };
			const { next, oldKeySlot } = computeAssignOne(
				prev,
				slotIndex,
				(k) => k.location === location && k.moduleIndex === moduleIndex && k.paramIndex === paramIndex,
				entry,
			);
			// oldKeySlot's own slot only needs a CLI restore on undo (the hardware auto-evicts it as
			// part of the single assign-knob call on apply, per the two-way uniqueness doc above).
			const undoTouched = [slotIndex, ...(oldKeySlot && oldKeySlot.slotIndex !== slotIndex ? [oldKeySlot.slotIndex] : [])];
			await this._applyParamPages(slot, next, [slotIndex]);
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						await this._applyParamPages(slot, prev, undoTouched);
					},
					redo: async () => {
						await this.assignParamToPage(slot, slotIndex, location, moduleIndex, paramIndex);
					},
				});
			}
		},

		// Bulk module-level assign — the manual's "Assign|Page X|Multi Column" / "...|Column N" popup,
		// right-clicked on a module's background instead of one parameter. Assigns
		// moduleDef.params[0..count-1] to `count` consecutive knob slots starting at startSlotIndex
		// (page/bank/knob order — see paramPages.ts), landing as one undo entry via _applyParamPages,
		// same as swapParamPageSlots. Evicts whatever occupied those slots AND any of this module's
		// OTHER existing page assignments (the same two-way uniqueness assignParamToPage enforces for
		// one param, generalized to N so re-running this always leaves the module cleanly assigned
		// rather than stragglers elsewhere). Truncates rather than erroring if there isn't enough room
		// left before slot 119 — mirrors autoAssignMidiCC's cc>119 cutoff.
		async assignModuleToPage(slot: SlotLabel, startSlotIndex: number, location: 0 | 1, moduleIndex: number, count: number): Promise<void> {
			const n = Math.min(count, TOTAL_KNOB_SLOTS - startSlotIndex);
			if (n <= 0) return;
			const prev = [...this.slots[slot].paramPages];
			const targetSlots = Array.from({ length: n }, (_, i) => startSlotIndex + i);
			const { next, touched } = computeAssignModule<ParamPageAssignment>(
				prev,
				targetSlots,
				(k) => k.location === location && k.moduleIndex === moduleIndex,
				(paramIndex, slotIndex) => ({ slotIndex, location, moduleIndex, paramIndex, isLed: 0 }),
			);
			await this._applyParamPages(slot, next, touched);
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						await this._applyParamPages(slot, prev, touched);
					},
					redo: async () => {
						await this.assignModuleToPage(slot, startSlotIndex, location, moduleIndex, count);
					},
				});
			}
		},

		// Replaces the whole Parameter Pages list and re-syncs only the knob slots named in `touched`
		// (one assign-knob or deassign-knob each, matching what the hardware expects per slot), as a
		// single batched CLI call. Undo/redo of a multi-slot edit is just this applied to the
		// before/after list.
		async _applyParamPages(slot: SlotLabel, list: ParamPageAssignment[], touched: number[]): Promise<void> {
			this.slots[slot].paramPages = [...list];
			this._markSlotDirty(slot);
			if (this.slots[slot].patch) this.slots[slot].patch!.paramPages = [...list];
			const deviceStore = useDeviceStore();
			if (deviceStore.status !== DeviceStatus.Connected) return;
			const cmds = buildTouchedCmds(
				list,
				touched,
				(entry) => assignKnobCmd(slot, entry),
				(slotIndex) => ['deassign-knob', slot, String(slotIndex)],
			);
			if (cmds.length > 0) await runCliBatchSafe(cmds, '_applyParamPages');
		},

		// Moves a knob slot's assignment onto another slot, exchanging with that slot's occupant when
		// it has one. Both writes are computed as a single new list rather than as two
		// assignParamToPage calls, so the pair lands as ONE undo entry — otherwise a single Ctrl+Z
		// leaves the swap half-applied.
		async swapParamPageSlots(slot: SlotLabel, sourceSlotIndex: number, targetSlotIndex: number): Promise<void> {
			if (sourceSlotIndex === targetSlotIndex) return;
			const prev = [...this.slots[slot].paramPages];
			const next = computeSwap(prev, sourceSlotIndex, targetSlotIndex);
			if (!next) return;

			const touched = [sourceSlotIndex, targetSlotIndex];
			await this._applyParamPages(slot, next, touched);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						await this._applyParamPages(slot, prev, touched);
					},
					redo: async () => {
						await this._applyParamPages(slot, next, touched);
					},
				});
			}
		},

		async deassignParamPage(slot: SlotLabel, slotIndex: number): Promise<void> {
			const prev = [...this.slots[slot].paramPages];
			const next = prev.filter((k) => k.slotIndex !== slotIndex);
			await this._applyParamPages(slot, next, [slotIndex]);
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						await this._applyParamPages(slot, prev, [slotIndex]);
					},
					redo: async () => {
						await this.deassignParamPage(slot, slotIndex);
					},
				});
			}
		},

		// Global Parameter Pages siblings of assignParamToPage/_applyParamPages/swapParamPageSlots/
		// deassignParamPage above. Performance-scoped (this.globalParamPages, not any one slot's
		// paramPages) and — per design decision — no undo/redo in this first pass, unlike the
		// per-patch versions. `targetSlot` is which patch's module the knob controls; the CLI's
		// transport slot (which USB session the command rides on) is always uiStore.slotInFocus,
		// matching selectGlobalParamPage. Each mutation still marks the affected patch slot(s) dirty
		// via the existing per-slot _markSlotDirty, even though globalParamPages itself lives outside
		// any one slot's patch — that's the only "unsaved edits" signal the app has.
		async assignParamToGlobalPage(targetSlot: SlotLabel, slotIndex: number, location: 0 | 1, moduleIndex: number, paramIndex: number): Promise<void> {
			const prev = this.globalParamPages;
			const entry: GlobalParamPageAssignment = { slotIndex, slot: targetSlot, location, moduleIndex, paramIndex, isLed: 0 };
			const { next, oldAtSlot, oldKeySlot } = computeAssignOne(
				prev,
				slotIndex,
				(k) => k.slot === targetSlot && k.location === location && k.moduleIndex === moduleIndex && k.paramIndex === paramIndex,
				entry,
			);
			this.globalParamPages = next;
			this._markSlotDirty(targetSlot);
			if (oldAtSlot) this._markSlotDirty(oldAtSlot.slot);
			if (oldKeySlot) this._markSlotDirty(oldKeySlot.slot);
			const active = useUiStore().slotInFocus;
			const deviceStore = useDeviceStore();
			if (active && deviceStore.status === DeviceStatus.Connected) await runCliSafe(assignGlobalKnobCmd(active, entry), 'assignParamToGlobalPage');
		},

		// Global Parameter Pages sibling of assignModuleToPage above — no undo/redo, matching the rest
		// of this Global section's "no undo in this first pass" design decision.
		async assignModuleToGlobalPage(targetSlot: SlotLabel, startSlotIndex: number, location: 0 | 1, moduleIndex: number, count: number): Promise<void> {
			const n = Math.min(count, TOTAL_KNOB_SLOTS - startSlotIndex);
			if (n <= 0) return;
			const targetSlots = Array.from({ length: n }, (_, i) => startSlotIndex + i);
			const { next, touched } = computeAssignModule<GlobalParamPageAssignment>(
				this.globalParamPages,
				targetSlots,
				(k) => k.slot === targetSlot && k.location === location && k.moduleIndex === moduleIndex,
				(paramIndex, slotIndex) => ({ slotIndex, slot: targetSlot, location, moduleIndex, paramIndex, isLed: 0 }),
			);
			await this._applyGlobalParamPages(next, touched);
		},

		// Replaces the whole Global Parameter Pages list and re-syncs only the knob slots named in
		// `touched` — mirrors _applyParamPages, plus marks every distinct patch slot touched (by
		// either the old or new occupant of each touched knob slot) dirty, since this list isn't
		// nested inside any one slot's patch for that to happen automatically.
		async _applyGlobalParamPages(list: GlobalParamPageAssignment[], touched: number[]): Promise<void> {
			const prevList = this.globalParamPages;
			const dirtySlots = new Set<SlotLabel>();
			for (const slotIndex of touched) {
				const oldEntry = prevList.find((k) => k.slotIndex === slotIndex);
				const newEntry = list.find((k) => k.slotIndex === slotIndex);
				if (oldEntry) dirtySlots.add(oldEntry.slot);
				if (newEntry) dirtySlots.add(newEntry.slot);
			}
			dirtySlots.forEach((s) => this._markSlotDirty(s));
			this.globalParamPages = [...list];
			const active = useUiStore().slotInFocus;
			const deviceStore = useDeviceStore();
			if (!active || deviceStore.status !== DeviceStatus.Connected) return;
			const cmds = buildTouchedCmds(
				list,
				touched,
				(entry) => assignGlobalKnobCmd(active, entry),
				(slotIndex) => ['deassign-global-knob', active, String(slotIndex)],
			);
			if (cmds.length > 0) await runCliBatchSafe(cmds, '_applyGlobalParamPages');
		},

		async swapGlobalParamPageSlots(sourceSlotIndex: number, targetSlotIndex: number): Promise<void> {
			if (sourceSlotIndex === targetSlotIndex) return;
			const next = computeSwap(this.globalParamPages, sourceSlotIndex, targetSlotIndex);
			if (!next) return;
			await this._applyGlobalParamPages(next, [sourceSlotIndex, targetSlotIndex]);
		},

		async deassignGlobalParamPage(slotIndex: number): Promise<void> {
			const removed = this.globalParamPages.find((k) => k.slotIndex === slotIndex);
			this.globalParamPages = this.globalParamPages.filter((k) => k.slotIndex !== slotIndex);
			if (removed) this._markSlotDirty(removed.slot);
			const active = useUiStore().slotInFocus;
			const deviceStore = useDeviceStore();
			if (active && deviceStore.status === DeviceStatus.Connected)
				await runCliSafe(['deassign-global-knob', active, String(slotIndex)], 'deassignGlobalParamPage');
		},

		async deassignMidiCCs(slot: SlotLabel, ccs: number[]): Promise<void> {
			const ccSet = new Set(ccs);
			const prevControllers = [...this.slots[slot].controllers];
			this.slots[slot].controllers = this.slots[slot].controllers.filter((c) => !ccSet.has(c.cc));
			this._markSlotDirty(slot);
			if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...this.slots[slot].controllers];
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						this.slots[slot].controllers = prevControllers;
						this._markSlotDirty(slot);
						if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...prevControllers];
						const restored = prevControllers.filter((c) => ccSet.has(c.cc));
						const deviceStore = useDeviceStore();
						if (deviceStore.status === DeviceStatus.Connected && restored.length > 0) {
							const flatArgs = restored.flatMap((a) => {
								const locStr = ccLocationStr(a.location);
								return [locStr, String(a.moduleIndex), String(a.paramIndex), String(a.cc)];
							});
							await window.cli.run(['assign-midicc-batch', slot, ...flatArgs]);
						}
					},
					redo: async () => {
						await this.deassignMidiCCs(slot, ccs);
					},
				});
			}
			const deviceStore = useDeviceStore();
			if (deviceStore.status === DeviceStatus.Connected && ccs.length > 0) await window.cli.run(['deassign-midicc-batch', slot, ...ccs.map(String)]);
		},

		async deassignAllMidiCC(slot: SlotLabel): Promise<void> {
			const prevControllers = [...this.slots[slot].controllers];
			const ccs = prevControllers.map((c) => c.cc);
			this.slots[slot].controllers = [];
			this._markSlotDirty(slot);
			if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [];
			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						this.slots[slot].controllers = prevControllers;
						this._markSlotDirty(slot);
						if (this.slots[slot].patch) this.slots[slot].patch!.controllers = [...prevControllers];
						const deviceStore = useDeviceStore();
						if (deviceStore.status === DeviceStatus.Connected && prevControllers.length > 0) {
							const flatArgs = prevControllers.flatMap((a) => {
								const locStr = ccLocationStr(a.location);
								return [locStr, String(a.moduleIndex), String(a.paramIndex), String(a.cc)];
							});
							await window.cli.run(['assign-midicc-batch', slot, ...flatArgs]);
						}
					},
					redo: async () => {
						await this.deassignAllMidiCC(slot);
					},
				});
			}
			const deviceStore = useDeviceStore();
			if (deviceStore.status === DeviceStatus.Connected && ccs.length > 0) await window.cli.run(['deassign-midicc-batch', slot, ...ccs.map(String)]);
		},

		async autoAssignMidiCC(slot: SlotLabel, targets: { location: 0 | 1 | 2; moduleIndex: number; paramIndex: number }[]): Promise<void> {
			const usedCCs = new Set(this.slots[slot].controllers.map((c) => c.cc));
			const newAssignments: MidiCCAssignment[] = [];
			for (const t of targets) {
				let cc = 2;
				while (cc <= 119 && (usedCCs.has(cc) || !isAllowedCC(cc))) cc++;
				if (cc > 119) break;
				usedCCs.add(cc);
				newAssignments.push({ cc, location: t.location, moduleIndex: t.moduleIndex, paramIndex: t.paramIndex });
			}
			const newCCSet = new Set(newAssignments.map((a) => a.cc));
			const prevControllers = [...this.slots[slot].controllers];
			this.slots[slot].controllers = [...this.slots[slot].controllers.filter((c) => !newCCSet.has(c.cc)), ...newAssignments];
			this._markSlotDirty(slot);
			const hist = useHistoryStore();
			if (!hist.isLocked(slot) && newAssignments.length > 0) {
				hist.record(slot, {
					undo: async () => {
						this.slots[slot].controllers = prevControllers;
						this._markSlotDirty(slot);
						const deviceStore = useDeviceStore();
						if (deviceStore.status === DeviceStatus.Connected) {
							const cmds: string[][] = [['deassign-midicc-batch', slot, ...newAssignments.map((a) => String(a.cc))]];
							const restored = prevControllers.filter((c) => newCCSet.has(c.cc));
							if (restored.length > 0) {
								const flatArgs = restored.flatMap((a) => {
									const locStr = ccLocationStr(a.location);
									return [locStr, String(a.moduleIndex), String(a.paramIndex), String(a.cc)];
								});
								cmds.push(['assign-midicc-batch', slot, ...flatArgs]);
							}
							await window.cli.runBatch(cmds);
						}
					},
					redo: async () => {
						await this.autoAssignMidiCC(slot, targets);
					},
				});
			}
			const deviceStore = useDeviceStore();
			if (deviceStore.status === DeviceStatus.Connected && newAssignments.length > 0) {
				const flatArgs = newAssignments.flatMap((a) => {
					const locStr = ccLocationStr(a.location);
					return [locStr, String(a.moduleIndex), String(a.paramIndex), String(a.cc)];
				});
				await window.cli.run(['assign-midicc-batch', slot, ...flatArgs]);
			}
		},
	},
});
