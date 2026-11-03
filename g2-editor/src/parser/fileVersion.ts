// .pch2/.prf2 format versions. The byte after the text header's NUL is the version; current files
// are 23 (0x17). The official editor converts an older file one version at a time on load
// (CFileConverter, ConvertPatchNtoN+1 in G2Editor.c). This is a clean-room port of steps 19→20 …
// 22→23, checked against files the official editor v1.62 saved (test-patches/converted/).

import type { Cable, GlobalParamPageAssignment, MidiCCAssignment, ParamPageAssignment, PatchParamVariation } from '../types/patch';
import type { ModuleInstance } from '../types/module';
import { PATCH_MORPH_MODULE_ID } from './constants';
import { defaultMutaLock } from '../renderer/mutator';

export const FILE_VERSION_CURRENT = 23;
export const FILE_VERSION_OLDEST = 19;

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
// controller and global knob on the parameter, with renumbering.
function removeParam(s: ConvertSlot, loc: number, m: ModuleInstance, p: number): void {
	s.areas[loc].values.get(m.index)?.forEach((v) => v.splice(p, 1));
	if (m.paramLabels) {
		m.paramLabels = m.paramLabels.filter((l) => l.paramIndex !== p);
		for (const l of m.paramLabels) if (l.paramIndex > p) l.paramIndex--;
	}
	removeMorphs(s, loc, m.index, p);
	removeRefs(s.knobs, loc, m.index, p);
	removeRefs(s.controllers, loc, m.index, p);
	removeRefs(s.globalKnobs, loc, m.index, p, s.slot);
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
