import type { ModuleInstance, ParamLabel } from './module';

export interface Cable {
	colour: number;
	userColour?: number; // set only when user explicitly overrides via context menu
	smod: number;
	scon: number;
	dir?: number;
	dmod: number;
	dcon: number;
	[key: string]: unknown;
}

export interface Area {
	name: string;
	modules: ModuleInstance[];
	cableList: Cable[];
	paramaterDataOfs: number;
	nummod?: number;
	numcab?: number;
	[key: string]: unknown;
}

export interface PatchDescription {
	voices: number;
	height: number; // FBarPosition: 0=FX mode, 1-3999=split (voice% = height/4000*100), ≥4000=Voice mode
	octaveShift: number; // raw stored value; actual shift = octaveShift - 2
	red: number;
	blue: number;
	yellow: number;
	orange: number;
	green: number;
	purple: number;
	white: number;
	monopoly: number;
	variation: number;
	category: number;
}

export interface PatchParamVariation {
	patchVol: number;
	activeMuted: number;
	glide: number;
	glideTime: number;
	bend: number;
	semi: number;
	vibrato: number;
	cents: number;
	rate: number;
	arpeggiator: number;
	arpTime: number;
	arpType: number;
	octaveShift: number;
	sustain: number;
	octaves: number;
	morphDials: number[];
	morphModes: number[];
	morphAssignments: MorphAssignment[];
}

// Assigns a module parameter to one of the 8 Morph Groups with a signed range. A param may be
// assigned to several groups at once (several entries, same location/moduleIndex/paramIndex,
// different groupIndex). Range is never 0 once assigned — see nmg2PatchParser.ts's MORPH_PARAMS
// section for why (the real G2 binary format deletes a record when its range hits 0).
export interface MorphAssignment {
	groupIndex: number; // 0-7
	location: 0 | 1; // 0=FX, 1=Voice
	moduleIndex: number;
	paramIndex: number;
	range: number; // signed, -127..127
}

export const PATCH_PARAM_KEYS: (keyof PatchParamVariation)[] = [
	'patchVol',
	'activeMuted',
	'glide',
	'glideTime',
	'bend',
	'semi',
	'vibrato',
	'cents',
	'rate',
	'arpeggiator',
	'arpTime',
	'arpType',
	'octaves',
	'octaveShift',
	'sustain',
];

export const NUM_VARIATIONS = 9; // stored in patch files: 8 variations + INIT
// Live-only 10th variation: the Patch Mutator's audition slot. Kept in memory (SlotEntry.variations
// has NUM_VARIATIONS + 1 entries) and on the G2, but never written to a patch file.
export const MUTATOR_VARIATION = 9;
export const MORPH_NAMES = ['Wheel', 'Vel', 'Keyb', 'Aft.Tch', 'Sust.Pd', 'Ctrl.Pd', 'P.Stick', 'G.Wh 2'];
export const MORPH_MODE_OPTIONS: string[][] = [
	['Knob', 'Wheel'],
	['Knob', 'Vel'],
	['Knob', 'Keyb'],
	['Knob', 'Aft.Tch'],
	['Knob', 'Sust.Pd', 'G.Wh1'],
	['Knob', 'Ctrl.Pd'],
	['Knob', 'P.Stick'],
	['Knob', 'G.Wh2'],
];

export interface VariationState {
	/** moduleIndex → params[paramIdx], areaIdx=0 (fx) */
	fx: Record<number, number[]>;
	/** moduleIndex → params[paramIdx], areaIdx=1 (voice) */
	voice: Record<number, number[]>;
	/** Global patch-level parameters for this variation */
	patch: PatchParamVariation;
}

export interface MidiCCAssignment {
	cc: number; // 0–119
	location: 0 | 1 | 2; // 0=FX, 1=Voice, 2=Patch (incl. morphs)
	moduleIndex: number;
	paramIndex: number;
}

// Assigns a module parameter to one of the 120 front-panel "Parameter Pages" assignable knob/button
// slots (3 Banks x 5 Pages A-E x 8 knobs). slotIndex is the array position in the patch-file's
// C_KNOBS ($62) section and is the sole address of a slot — bank/page/knob are derived from it via
// slotIndexToBankPageKnob() (renderer/paramPages.ts), not stored separately. Reverse-engineered from
// BVE.NMG2File.pas's TKnob/TKnobList, cross-validated against decompiled G2Editor.c. Stored per-patch
// (like MidiCCAssignment/controllers), NOT per-variation (unlike MorphAssignment).
export interface ParamPageAssignment {
	slotIndex: number; // 0-119
	location: 0 | 1 | 2; // 0=FX, 1=Voice, 2=Patch (PATCH_MORPH pseudo-module: Morph Group dials)
	moduleIndex: number;
	paramIndex: number;
	isLed: number; // 0=param, 1=level meter (paramIndex is then its LED number); 2-bit field, EDeviceAssignType in G2Editor.c
}

// The Global Parameter Pages sibling of ParamPageAssignment (same 120-slot 3 Banks x 5 Pages x 8
// Knobs geometry) — but Performance-scoped, not Patch-scoped: each slot can target a module
// parameter in ANY of the 4 patch slots (A-D), addressed by the extra `slot` field. Stored in the
// .prf2's C_KNOBS_GLOBAL ($5f) section, not inside any one Patch. Reverse-engineered from
// BVE.NMG2File.pas's TGlobalKnob (a TKnob subclass adding a trailing 2-bit FSlotIndex).
export interface GlobalParamPageAssignment {
	slotIndex: number; // 0-119
	slot: 'A' | 'B' | 'C' | 'D'; // which patch slot's module this targets (SlotLabel, inlined — types/index.ts's SlotLabel re-exports from this file, so importing it here would be circular)
	location: 0 | 1 | 2; // 0=FX, 1=Voice, 2=Patch (PATCH_MORPH pseudo-module: Morph Group dials)
	moduleIndex: number;
	paramIndex: number;
	isLed: number; // 0=param, 1=level meter (paramIndex is then its LED number); 2-bit field, EDeviceAssignType in G2Editor.c
}

// One rename for slots.renameItems: a module name, a switch-param button label, or a Morph Group label.
export type RenameChange =
	| { kind: 'module'; area: 'voice' | 'fx'; moduleIndex: number; text: string }
	| { kind: 'param'; area: 'voice' | 'fx'; moduleIndex: number; paramIndex: number; labelIndex: number; text: string }
	| { kind: 'morph'; groupIndex: number; text: string };

export interface Patch {
	areas: [Area, Area];
	description?: PatchDescription;
	mode?: { area: 0 | 1; variation: number };
	splitHeight?: number; // remembered voice-area height to restore split position after a Voice/FX toggle (session state; the .pch2 has only the single `height` field)
	patchParams?: PatchParamVariation[];
	controllers?: MidiCCAssignment[];
	paramPages?: ParamPageAssignment[];
	text?: string; // free-text patch notes ("Text Pad" / C_PATCH_NOTES section)
	morphParamLabels?: ParamLabel[]; // custom Morph Group names; paramIndex 8-15 = group (paramIndex-8)
	// One 0-2 value per morph group, from the C_MORPH_PARAM ($65) header (G2Editor.c calls it
	// SetKeyboardMorphAssign). Carried through so a save cannot silently zero it — every genuine
	// file scanned and the live device capture have it all-zero, so nothing reads it yet.
	morphKeyboardAssign?: number[];
}

export interface ClipboardEntry {
	modules: ModuleInstance[];
	cables: Cable[];
	area: 'va' | 'fx';
	copiedVariation: number; // uiStore.variation at copy time — which slice of `lv` Paste Params should use
	morphs?: MorphAssignment[][]; // per variation, the copied modules' morph assignments (source indices); absent from older builds
}

export const VOICEMODE_OPTIONS = [
	{ id: 0, name: 'Poly' },
	{ id: 1, name: 'Mono' },
	{ id: 2, name: 'Legato' },
];

export const VOICES = [
	{ id: 0, name: '1' },
	{ id: 1, name: '2' },
	{ id: 2, name: '3' },
	{ id: 3, name: '4' },
	{ id: 4, name: '5' },
	{ id: 5, name: '6' },
	{ id: 6, name: '7' },
	{ id: 7, name: '8' },
	{ id: 8, name: '9' },
	{ id: 9, name: '10' },
	{ id: 10, name: '11' },
	{ id: 11, name: '12' },
	{ id: 12, name: '13' },
	{ id: 13, name: '14' },
	{ id: 14, name: '15' },
	{ id: 15, name: '16' },
	{ id: 16, name: '17' },
	{ id: 17, name: '18' },
	{ id: 18, name: '19' },
	{ id: 19, name: '20' },
	{ id: 20, name: '21' },
	{ id: 21, name: '22' },
	{ id: 22, name: '23' },
	{ id: 23, name: '24' },
	{ id: 24, name: '25' },
	{ id: 25, name: '26' },
	{ id: 26, name: '27' },
	{ id: 27, name: '28' },
	{ id: 28, name: '29' },
	{ id: 29, name: '30' },
	{ id: 30, name: '31' },
	{ id: 31, name: '32' },
];
