import type { ModuleInstance } from './module';

export interface Cable {
	colour: number;
	smod: number;
	scon: number;
	dir: number;
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
	height: number;
	unk2: number;
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

export const NUM_VARIATIONS = 9;
export const NUM_MORPHS = 8;
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

export interface Patch {
	areas: [Area, Area];
	description?: PatchDescription;
	mode?: { area: 0 | 1; variation: number };
	patchParams?: PatchParamVariation[];
}

export interface ClipboardEntry {
	modules: ModuleInstance[];
	cables: Cable[];
	area: 'va' | 'fx';
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
