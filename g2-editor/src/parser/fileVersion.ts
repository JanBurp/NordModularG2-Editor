// .pch2/.prf2 format versions. The byte after the text header's NUL is the version; current files
// are 23 (0x17). The official editor converts an older file one version at a time on load
// (CFileConverter, ConvertPatchNtoN+1 in G2Editor.c). This is a clean-room port of steps 13→14 …
// 22→23, checked against files the official editor v1.62 saved (test-patches/converted/). The file
// layout itself is the same from 13 on (every version reads through CPatchFile_13::ReadMolecules).

import type { Cable, GlobalParamPageAssignment, MidiCCAssignment, ParamPageAssignment, PatchParamVariation } from '../types/patch';
import type { ModuleInstance } from '../types/module';
import { PATCH_MORPH_MODULE_ID } from './constants';
import { defaultMutaLock } from '../renderer/mutator';

export const FILE_VERSION_CURRENT = 23;
export const FILE_VERSION_OLDEST = 13;

// One slot as the parser holds it before the param values are spread into each module's `lv`.
export interface ConvertArea {
	modules: ModuleInstance[];
	cableList: Cable[];
	values: Map<number, number[][]>; // module index → [variation] → the file's param values
	unknown: { index: number; type: number }[]; // modules the parser skipped (type not defined)
}
export interface ConvertSlot {
	areas: ConvertArea[]; // [FX, Voice], the same as a reference's location 0 and 1
	patchParams: PatchParamVariation[];
	knobs: ParamPageAssignment[];
	controllers: MidiCCAssignment[];
	globalKnobs: GlobalParamPageAssignment[]; // a performance's global knobs (all slots), else []
	slot?: string; // the slot's letter in a performance
}

type Ref = { location: number; moduleIndex: number; paramIndex: number; slot?: string };

const PATCH_SETTINGS = 2; // location of the patch settings (Morph Groups = PATCH_MORPH_MODULE_ID)

// Runs every step from `version` up to the current version. Returns false for a version older
// than the oldest one we can convert (the slot is left as it is).
export function convertSlotToCurrent(s: ConvertSlot, version: number): boolean {
	if (version >= FILE_VERSION_CURRENT) return true;
	if (version < FILE_VERSION_OLDEST) return false;
	if (version < 14) step13to14(s);
	if (version < 15) step14to15(s);
	if (version < 16) step15to16(s);
	if (version < 17) step16to17(s);
	if (version < 18) step17to18(s);
	if (version < 19) step18to19(s);
	if (version < 20) step19to20(s);
	if (version < 21) step20to21(s);
	if (version < 22) step21to22(s);
	for (const a of s.areas) for (const m of a.modules) m.mutaLock = defaultMutaLock(m.type); // 22→23 (Off:61538)
	return true;
}

// ---- Shared edits, as the official map classes do them ----

// The map RemoveParam methods (Morph/Knob/CtrlMapData_11): drop the entries on one parameter and
// move those on higher parameters of the same module down by one. In a performance only the
// slot's own global knobs are touched.
function removeRefs(list: Ref[], loc: number, mod: number, p: number, slot?: string): void {
	for (let i = list.length - 1; i >= 0; i--) {
		const r = list[i];
		if (r.location !== loc || r.moduleIndex !== mod || r.paramIndex < p || (r.slot !== undefined && r.slot !== slot)) continue;
		if (r.paramIndex === p) list.splice(i, 1);
		else r.paramIndex--;
	}
}

function removeMorphs(s: ConvertSlot, loc: number, mod: number, p: number): void {
	for (const pp of s.patchParams) if (pp) removeRefs(pp.morphAssignments, loc, mod, p);
}

// RemoveParam (Off:60085): the value in every variation, the label, and every morph, knob,
// controller and global knob on the parameter, with renumbering. The RemoveParam of steps 13…19
// (Off:57753) has no performance argument: it leaves the global knobs alone (`global` false).
function removeParam(s: ConvertSlot, loc: number, m: ModuleInstance, p: number, global = true): void {
	s.areas[loc].values.get(m.index)?.forEach((v) => v.splice(p, 1));
	if (m.paramLabels) {
		m.paramLabels = m.paramLabels.filter((l) => l.paramIndex !== p);
		for (const l of m.paramLabels) if (l.paramIndex > p) l.paramIndex--;
	}
	removeMorphs(s, loc, m.index, p);
	removeRefs(s.knobs, loc, m.index, p);
	removeRefs(s.controllers, loc, m.index, p);
	if (global) removeRefs(s.globalKnobs, loc, m.index, p, s.slot);
}

// CModuleParamData_11::AddParam: inserts a value in every variation. Nothing else is renumbered.
function addParam(s: ConvertSlot, loc: number, m: ModuleInstance, p: number, value: number): void {
	s.areas[loc].values.get(m.index)?.forEach((v) => v.splice(p, 0, value));
}

// CCableData_11::RemoveConnector: deletes the cables on one connector and moves the cables on
// higher connectors of the same kind down by one. Our cables always end on an input; `dir` 1
// means the start is an output.
function removeConnector(cables: Cable[], mod: number, con: number, output: boolean): void {
	for (let i = cables.length - 1; i >= 0; i--) {
		const c = cables[i];
		const src = c.smod === mod && ((c.dir ?? 1) === 1) === output;
		const dst = !output && c.dmod === mod;
		if ((src && c.scon === con) || (dst && c.dcon === con)) {
			cables.splice(i, 1);
			continue;
		}
		if (src && c.scon > con) c.scon--;
		if (dst && c.dcon > con) c.dcon--;
	}
}

function swapRefs(list: Ref[], a: number, b: number, slot?: string): void {
	for (const r of list) {
		if (r.location !== PATCH_SETTINGS || r.moduleIndex !== PATCH_MORPH_MODULE_ID || (r.slot !== undefined && r.slot !== slot)) continue;
		if (r.paramIndex === a) r.paramIndex = b;
		else if (r.paramIndex === b) r.paramIndex = a;
	}
}

// ScaleParam (Off:61151): maps a value through f and keeps each morph pointing at the mapped
// end point. A morph that would collapse to 0 keeps a range of ±1.
function scaleParam(s: ConvertSlot, loc: number, mod: number, v: number, vals: number[], p: number, f: (x: number) => number): void {
	const old = vals[p];
	const scaled = f(old);
	vals[p] = scaled;
	for (const a of s.patchParams[v]?.morphAssignments ?? []) {
		if (a.location !== loc || a.moduleIndex !== mod || a.paramIndex !== p) continue;
		const range = f(Math.max(0, Math.min(127, old + a.range))) - scaled;
		a.range = range !== 0 ? range : a.range >= 1 ? 1 : -1;
	}
}

function eachModule(s: ConvertSlot, fn: (m: ModuleInstance, loc: number, vars: number[][]) => void): void {
	s.areas.forEach((a, loc) => {
		for (const m of a.modules) fn(m, loc, a.values.get(m.index) ?? []);
	});
}

// ---- 13→14 … 18→19 ----
// Each ConvertPatchNtoN+1 copies the file as it is, then runs UpdateModule for the patch settings'
// blocks (as types 6 = Morph Groups, 0x5f = Volume/Active, …) and for every module.

// The morphs of one variation on (loc, module, p).
const morphsOn = (s: ConvertSlot, v: number, loc: number, mod: number, p: number) =>
	(s.patchParams[v]?.morphAssignments ?? []).filter((a) => a.location === loc && a.moduleIndex === mod && a.paramIndex === p);

// 13→14 (ConvertPatch13to14 Off:57835, UpdateModule Off:57774)
function step13to14(s: ConvertSlot): void {
	eachModule(s, (m, loc) => {
		if (m.type === 0x66) {
			// FltPhase
			for (const p of [9, 1, 0]) removeParam(s, loc, m, p, false);
			for (const p of [8, 9, 10]) addParam(s, loc, m, p, 0);
		} else if (m.type === 0x03 || m.type === 0x04)
			addParam(s, loc, m, 2, 0); // 4-Out, 2-Out: Pad
		else if (m.type === 0x7b)
			addParam(s, loc, m, 9, 0); // Mix4-1C: ExpLin
		else if (m.type === 0xc3) addParam(s, loc, m, 3, 1); // ModAmt: InvertMode
	});
}

// 14→15 (ConvertPatch14to15 Off:58256, UpdateModule Off:58021): Mute became Active (InvertParam
// Off:57989: 0 → 1, anything else → 0), per type the index of that parameter.
const ACTIVE_PARAM_15: Record<number, number> = {
	0x03: 1,
	0x04: 1,
	0x1f: 1,
	0x52: 1,
	0x7f: 1,
	0xaa: 1,
	0xab: 1,
	0x3e: 2,
	0x4a: 2,
	0x5e: 2,
	0x7d: 2,
	0x0c: 3,
	0x20: 3,
	0x3d: 3,
	0x57: 3,
	0x59: 3,
	0x67: 3,
	0x86: 3,
	0xbd: 3,
	0xc0: 3,
	0x18: 4,
	0x19: 4,
	0x60: 4,
	0xb0: 4,
	0x09: 5,
	0x1a: 5,
	0x21: 5,
	0x61: 5,
	0x76: 5,
	0xb7: 5,
	0x31: 6,
	0x33: 6,
	0x66: 6,
	0x96: 6,
	0x0d: 7,
	0xa2: 7,
	0xbe: 7,
	0x08: 8,
	0xb1: 8,
	0xc4: 8,
	0x07: 9,
	0x2d: 9,
	0xb6: 9,
	0xa3: 10,
	0xa4: 10,
	0x3a: 15,
};
const invert = (x: number) => (x === 0 ? 1 : 0);

function step14to15(s: ConvertSlot): void {
	// Volume block (0x5f) param 1. The decompiled switch also inverts Morph Groups (block 6) param 5, the
	// group 6 dial, but the official editor's saves keep that dial as it was (test-patches/converted/).
	for (const pp of s.patchParams) if (pp) pp.activeMuted = invert(pp.activeMuted);
	eachModule(s, (m, _loc, vars) => {
		const p = ACTIVE_PARAM_15[m.type];
		if (p !== undefined) for (const v of vars) if (v && p < v.length) v[p] = invert(v[p]);
	});
}

// 15→16 (ConvertPatch15to16 Off:58764, UpdateModule Off:58565): level and frequency params moved to
// a cubic scale. _gConvertTable from the official v1.62 Mac binary (not in the decompiled C).
// prettier-ignore
const CUBIFY = [
	0, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 9, 10, 11, 11, 12, 13, 14, 14, 15, 16, 16, 17, 18, 19, 20,
	20, 21, 22, 23, 24, 24, 25, 26, 27, 28, 29, 30, 31, 32, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 48, 49, 50,
	51, 52, 53, 54, 56, 57, 58, 59, 60, 61, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 75, 76, 77, 78, 79, 81, 82, 83, 84, 86, 87, 88,
	89, 91, 92, 93, 94, 96, 97, 98, 99, 100, 102, 103, 104, 105, 107, 108, 109, 110, 112, 113, 114, 115, 116, 118, 119, 120, 121, 122, 123, 125, 126, 127,
];
// Params cubified in every variation, in the official order.
const CUBIFY_16: Record<number, number[]> = {
	0x07: [3, 5],
	0x08: [3, 5],
	0x0d: [3, 5],
	0xa3: [3, 5],
	0x09: [7, 4],
	0x1b: [4],
	0x21: [4],
	0x67: [4],
	0xc4: [4],
	0x20: [2],
	0x30: [0, 1, 2, 3, 4, 5],
	0x3a: [4, 5, 13, 14, 11],
	0x66: [7],
	0x8c: [0, 1, 2, 3],
	0x19: [3],
	0x1a: [3],
	0x2d: [3],
	0x61: [3],
	0xa4: [3],
	0xa2: [1, 6],
	0xb7: [4, 6],
	0xbe: [1],
};
// Mixer levels cubified only in the variations whose ExpLin param (the second number) isn't 1 (linear).
const CUBIFY_IF_NOT_LIN_16: Record<number, [number[], number]> = {
	0x13: [[0, 1, 2, 3], 4],
	0x28: [[0, 1, 2, 3, 4, 5, 6, 7], 8],
	0x42: [[1, 3], 4],
	0x7b: [[0, 1, 2, 3], 9],
	0xa1: [[0, 1, 2, 3, 4, 5, 6, 7], 16],
	0xb8: [[0], 2],
	0xb9: [[0], 2],
	0xc3: [[0], 2],
	0xc2: [[0, 2], 4],
};

// HandleCubifyParam (Off:58455): unlike scaleParam, a morph range may become 0.
function cubify(s: ConvertSlot, loc: number, mod: number, v: number, vals: number[], p: number): void {
	const old = vals[p];
	vals[p] = CUBIFY[old];
	for (const a of morphsOn(s, v, loc, mod, p)) a.range = CUBIFY[Math.max(0, Math.min(127, old + a.range))] - CUBIFY[old];
}

function step15to16(s: ConvertSlot): void {
	for (const pp of s.patchParams) if (pp) pp.patchVol = CUBIFY[pp.patchVol]; // Volume block (0x5f) param 0
	eachModule(s, (m, loc, vars) => {
		const cables = s.areas[loc].cableList;
		vars.forEach((vals, v) => {
			if (!vals) return;
			for (const p of CUBIFY_16[m.type] ?? []) cubify(s, loc, m.index, v, vals, p);
			const ifNot = CUBIFY_IF_NOT_LIN_16[m.type];
			if (ifNot && vals[ifNot[1]] !== 1) for (const p of ifNot[0]) cubify(s, loc, m.index, v, vals, p);
			if (m.type === 0x57) vals[0] = vals[0] < 101 ? Math.max(vals[0] - 5, 0) : vals[0] < 111 ? vals[0] - 3 : vals[0]; // FltLP
		});
		if (m.type === 0x6c)
			removeParam(s, loc, m, 16, false); // Vocoder
		else if (m.type === 0xb1) {
			removeParam(s, loc, m, 5, false); // DelayB
			removeConnector(cables, m.index, 1, false);
		}
	});
}

// 16→17 (ConvertPatch16to17 Off:59159, UpdateModule Off:58960): Range and TimeClk params got fewer
// values (TruncParam Off:58923 caps them, morphs stay).
const TRUNC_17: Record<number, [number, number]> = {
	0x18: [3, 3],
	0x19: [1, 3],
	0x1a: [7, 3],
	0xbe: [2, 3],
	0xaf: [8, 1],
	0xb0: [5, 1],
	0xb1: [4, 1],
	0xb6: [6, 1],
};
// OscC/OscD Waveform mode: 2→3, 3→4, 4→5, 5→2, any other value above 1 up by one.
const waveform17 = (x: number) => (x <= 1 ? x : x === 5 ? 2 : x + 1);

function step16to17(s: ConvertSlot): void {
	eachModule(s, (m, loc, vars) => {
		if (m.type === 0x9e) removeParam(s, loc, m, 2, false); // Glide
		const trunc = TRUNC_17[m.type];
		vars.forEach((vals, v) => {
			if (!vals) return;
			if (trunc && vals[trunc[0]] > trunc[1]) vals[trunc[0]] = trunc[1];
			if (m.type === 0x5e) {
				// StChorus: half the range, morphs too (rounded away from zero, then truncated)
				vals[0] = (vals[0] + 1) >> 1;
				for (const a of morphsOn(s, v, loc, m.index, 0)) a.range = Math.trunc((a.range < 1 ? a.range - 1 : a.range + 1) / 2);
			}
		});
		if ((m.type === 0x09 || m.type === 0x60) && m.modes.length) m.modes[0] = waveform17(m.modes[0]);
	});
}

// 17→18 (ConvertPatch17to18 Off:59379, UpdateModule Off:59345)
function step17to18(s: ConvertSlot): void {
	eachModule(s, (m, loc) => {
		if (m.type === 0x76)
			for (const p of [4, 3]) removeParam(s, loc, m, p, false); // Digitizer
		else if (m.type === 0xc6) removeParam(s, loc, m, 0, false); // PitchTrack
	});
}

// 18→19 (ConvertPatch18to19 Off:59710, UpdateModule Off:59656): TimeClk set to 0 (ZeroParam Off:59547),
// the Out modules' Pad capped at 1 with its morphs (LimitParam Off:59572).
const ZERO_19: Record<number, number> = { 0xaf: 8, 0xb0: 5, 0xb1: 4, 0xb6: 6 };

function step18to19(s: ConvertSlot): void {
	eachModule(s, (m, loc, vars) => {
		vars.forEach((vals, v) => {
			if (!vals) return;
			const z = ZERO_19[m.type];
			if (z !== undefined && z < vals.length) vals[z] = 0;
			if ((m.type === 0x03 || m.type === 0x04) && vals[2] > 1) {
				vals[2] = 1;
				for (const a of morphsOn(s, v, loc, m.index, 2)) a.range = Math.max(-1, Math.min(1, a.range));
			}
		});
	});
}

// ---- 19→20 (ConvertPatch19to20, Off:59931) ----
function step19to20(s: ConvertSlot): void {
	eachModule(s, (m, _loc, vars) => {
		if (m.type !== 0x86) return; // FltHP: the frequency scale moved
		for (const v of vars) if (v) v[0] = v[0] < 101 ? Math.max(v[0] - 5, 0) : v[0] < 111 ? v[0] - 3 : v[0];
	});
}

// ---- 20→21 (ConvertPatch20to21 Off:60716, UpdateModule Off:60315) ----

// Parameters that lost their morph (and, for CtrlSend/CtrlRcv, their MIDI controller). The order
// is the official one: each removal renumbers the morphs on higher parameters, values stay.
const MORPHS_REMOVED_20: Record<number, number[]> = {
	0x2b: [1], // Constant
	0x32: [2], // ConstSwT
	0x54: [4], // EnvADR
	0x8d: [2, 0], // CtrlSend
	0x8e: [1], // PCSend
	0x8f: [2], // NoteSend
	0x92: [34], // SeqLev
	0x93: [1, 0], // CtrlRcv
	0x94: [1, 0], // NoteRcv
	0x95: [5, 4, 3, 2, 1, 0], // NoteZone
	0x98: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], // KeyQuant
	0x9c: [0], // NoteDet
	0x9d: [1], // LevConv
	0xbc: [2], // ConstSwM
};
const CONTROLLERS_REMOVED_20: Record<number, number[]> = { 0x8d: [1, 0], 0x93: [0] };

function step20to21(s: ConvertSlot): void {
	// Morph groups 5 and 6 (0-based 4, 5) trade places, with the Morph Group settings' dials (4/5)
	// and modes (12/13) and the knobs and controllers on them; the morph assignments follow the
	// group number.
	for (const pp of s.patchParams) {
		if (!pp) continue;
		for (const a of pp.morphAssignments) if (a.groupIndex === 4 || a.groupIndex === 5) a.groupIndex ^= 1;
		for (const arr of [pp.morphDials, pp.morphModes]) [arr[4], arr[5]] = [arr[5], arr[4]];
	}
	for (const [a, b] of [
		[4, 5],
		[12, 13],
	]) {
		swapRefs(s.knobs, a, b);
		swapRefs(s.controllers, a, b);
		swapRefs(s.globalKnobs, a, b, s.slot);
	}
	eachModule(s, (m, loc) => {
		for (const p of MORPHS_REMOVED_20[m.type] ?? []) removeMorphs(s, loc, m.index, p);
		for (const p of CONTROLLERS_REMOVED_20[m.type] ?? []) removeRefs(s.controllers, loc, m.index, p);
		const cables = s.areas[loc].cableList;
		if (m.type === 0x62) {
			// FreqShift
			removeParam(s, loc, m, 3);
			removeParam(s, loc, m, 1);
			addParam(s, loc, m, 3, 1);
			for (const o of [4, 3, 0]) removeConnector(cables, m.index, o, true);
			removeConnector(cables, m.index, 2, false);
		} else if (m.type === 0x8c) {
			addParam(s, loc, m, 8, 0); // Mix4-1S: ExpLin
		} else if (m.type === 0xca) {
			removeParam(s, loc, m, 8); // RandomB
		} else if (m.type === 0xce) {
			// RndClkB
			removeParam(s, loc, m, 5);
			removeParam(s, loc, m, 1);
			removeConnector(cables, m.index, 3, false);
			if (m.modes[0] > 1) m.modes[0] = 1;
		}
	});
}

// ---- 21→22 (ConvertPatch21to22 Off:61310, UpdateModule Off:61208) ----

const lfoRateSub = (x: number) => (x > 63 ? 127 : 2 * x + 1);
const lfoRateLoHi = (x: number) => (x > 115 ? 127 : x + 12);
const lfoRateBpm = (x: number) => (x < 11 ? 2 * x + 12 : x < 27 ? 4 * x - 8 : x <= 32 ? 2 * x + 44 : x > 51 ? 127 : x + 76);
const lfoRateClk = (x: number) => (x < 48 ? x + 8 : x > 115 ? 127 : x + 12);
// Picked by the LFO's Range value (Sub, Lo, Hi, BPM, Clk).
const LFO_RATE = [lfoRateSub, lfoRateLoHi, lfoRateLoHi, lfoRateBpm, lfoRateClk];

// ScaleGlide::convTable in the official v1.62 Mac binary.
// prettier-ignore
const GLIDE = [
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 10, 10, 11, 12, 12, 13,
	14, 15, 16, 16, 17, 18, 19, 19, 20, 21, 22, 22, 23, 24, 25, 25, 26, 27, 28, 28, 29, 30, 30, 31, 32, 33, 33, 34, 35, 36, 37, 37,
	38, 39, 40, 40, 41, 42, 43, 43, 44, 45, 45, 46, 47, 48, 48, 49, 50, 51, 51, 52, 53, 54, 54, 55, 56, 57, 57, 58, 59, 60, 61, 61,
	62, 63, 64, 65, 65, 66, 67, 68, 68, 69, 70, 71, 71, 72, 73, 73, 74, 75, 76, 76, 77, 78, 79, 80, 81, 81, 82, 83, 84, 85, 85, 87,
];
const glide = (x: number) => GLIDE[x];

const TYPE_REMOVED_22 = 77; // dropped with its cables (CopyModules)

function step21to22(s: ConvertSlot): void {
	s.areas.forEach((a) => {
		for (const u of a.unknown) {
			if (u.type !== TYPE_REMOVED_22) continue;
			for (const i of [1, 0]) removeConnector(a.cableList, u.index, i, false);
			for (const o of [2, 1, 0]) removeConnector(a.cableList, u.index, o, true);
		}
	});
	eachModule(s, (m, loc, vars) => {
		vars.forEach((vals, v) => {
			if (m.type === 0x1a && (vals[4] === 4 || vals[4] === 5)) {
				// LfoA, per variation
				const f = LFO_RATE[vals[7]];
				if (f) scaleParam(s, loc, m.index, v, vals, 0, f);
			} else if (m.type === 0x9e && vals[2] === 1) {
				scaleParam(s, loc, m.index, v, vals, 0, glide); // Glide
			} else if (m.type === 0x18 && (m.modes[0] === 4 || m.modes[0] === 5)) {
				// LfoC, by its waveform mode
				const f = LFO_RATE[vals[3]];
				if (f) scaleParam(s, loc, m.index, v, vals, 0, f);
			}
		});
		if (m.type === 0x45) m.modes.push(0); // ClkDiv: new mode
	});
}
