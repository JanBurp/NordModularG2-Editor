// Factory drum-kit presets for the DrumSynth module (module type 58). Not a hardware concept —
// the G2 has no wire-protocol notion of a "preset"; these are just fixed values for the module's
// 15 continuous params (indices 0-14: Masterfreq..Noise, see nmg2mods.ts's DrumSynth entry). The
// original Clavia editor let you step through them and showed "none" once a knob drifted off the
// preset's exact values. Extracted from a real factory patch (test-patches/DrumSynthPresets.pch2,
// one DrumSynth instance per preset, labeled with its name) via PatchParser — no other source
// (decompiled editor, extracted resources, other reimplementations) has this literal data.

export interface DrumSynthPreset {
	name: string;
	values: number[]; // 15 values, param indices 0-14 (Masterfreq..Noise)
}

export const DRUM_SYNTH_PRESETS: DrumSynthPreset[] = [
	{ name: 'Kick 1', values: [42, 15, 46, 50, 120, 102, 57, 32, 39, 49, 1, 68, 61, 79, 115] },
	{ name: 'Kick 2', values: [43, 26, 55, 53, 105, 94, 63, 18, 78, 36, 1, 76, 44, 25, 123] },
	{ name: 'Kick 3', values: [31, 71, 45, 35, 127, 0, 90, 24, 71, 27, 0, 84, 42, 81, 112] },
	{ name: 'Kick 4', values: [32, 61, 58, 42, 113, 110, 90, 0, 0, 27, 1, 37, 55, 90, 127] },
	{ name: 'Kick 5', values: [36, 39, 50, 52, 104, 92, 111, 0, 40, 32, 0, 34, 68, 79, 69] },
	{ name: 'Snare 1', values: [79, 55, 35, 43, 127, 42, 102, 46, 0, 37, 2, 2, 0, 127, 127] },
	{ name: 'Snare 2', values: [68, 3, 48, 42, 84, 127, 55, 66, 63, 40, 2, 63, 37, 126, 122] },
	{ name: 'Snare 3', values: [64, 23, 36, 44, 120, 84, 26, 0, 19, 44, 2, 24, 44, 127, 98] },
	{ name: 'Snare 4', values: [68, 57, 47, 33, 105, 0, 91, 28, 42, 42, 0, 81, 44, 112, 127] },
	{ name: 'Snare 5', values: [85, 107, 32, 23, 127, 94, 0, 0, 63, 45, 2, 39, 55, 102, 98] },
	{ name: 'Tom1 1', values: [80, 38, 56, 47, 102, 58, 98, 26, 27, 50, 0, 33, 69, 105, 97] },
	{ name: 'Tom1 2', values: [69, 38, 57, 52, 102, 58, 96, 26, 27, 51, 0, 33, 69, 105, 89] },
	{ name: 'Tom1 3', values: [56, 38, 58, 52, 102, 58, 93, 26, 27, 53, 0, 33, 69, 105, 89] },
	{ name: 'Tom2 1', values: [86, 2, 55, 44, 99, 0, 67, 0, 56, 56, 0, 86, 65, 81, 117] },
	{ name: 'Tom2 2', values: [69, 2, 56, 45, 99, 0, 67, 0, 56, 56, 0, 86, 65, 81, 117] },
	{ name: 'Tom2 3', values: [55, 2, 58, 49, 99, 0, 67, 0, 56, 57, 0, 86, 65, 81, 117] },
	{ name: 'Tom3 1', values: [70, 28, 45, 51, 113, 81, 102, 4, 12, 47, 0, 44, 46, 96, 97] },
	{ name: 'Tom3 2', values: [58, 28, 46, 53, 113, 81, 102, 4, 12, 47, 0, 44, 57, 93, 97] },
	{ name: 'Tom3 3', values: [48, 28, 52, 54, 108, 81, 102, 4, 12, 47, 0, 44, 66, 96, 103] },
	{ name: 'Cymb 1', values: [127, 93, 0, 0, 0, 102, 91, 0, 26, 46, 2, 127, 0, 0, 127] },
	{ name: 'Cymb 2', values: [127, 93, 0, 0, 0, 102, 91, 50, 16, 55, 2, 127, 0, 0, 127] },
	{ name: 'Cymb 3', values: [127, 127, 19, 0, 28, 58, 112, 60, 0, 50, 2, 0, 0, 81, 107] },
	{ name: 'Cymb 4', values: [127, 127, 0, 0, 0, 127, 102, 107, 0, 53, 2, 127, 0, 0, 127] },
	{ name: 'Cymb 5', values: [28, 111, 42, 64, 73, 28, 83, 57, 37, 71, 0, 83, 50, 109, 123] },
	{ name: 'Perc 1', values: [77, 32, 31, 45, 117, 93, 32, 32, 40, 45, 2, 110, 126, 116, 30] },
	{ name: 'Perc 2', values: [127, 99, 52, 48, 86, 71, 110, 120, 0, 45, 2, 47, 16, 49, 114] },
	{ name: 'Perc 3', values: [96, 60, 36, 42, 127, 72, 32, 32, 40, 45, 2, 46, 24, 89, 46] },
	{ name: 'Perc 4', values: [87, 60, 36, 42, 127, 72, 32, 32, 40, 45, 2, 46, 24, 89, 46] },
	{ name: 'Perc 5', values: [110, 93, 58, 66, 92, 79, 92, 127, 0, 58, 0, 0, 0, 127, 89] },
	{ name: 'Perc 6', values: [30, 45, 62, 46, 127, 127, 55, 127, 28, 41, 2, 81, 55, 80, 97] },
];

// -1 when the current 15 values don't match any stored preset exactly (the "none" state).
export function findDrumSynthPresetIndex(values: number[]): number {
	return DRUM_SYNTH_PRESETS.findIndex((preset) => preset.values.every((v, i) => v === values[i]));
}
