import { describe, expect, it } from 'vitest';
import { DRUM_SYNTH_PRESETS, findDrumSynthPresetIndex } from '../drumSynthPresets';

describe('findDrumSynthPresetIndex', () => {
	it("matches a preset's exact values", () => {
		const kick1 = DRUM_SYNTH_PRESETS[0];
		expect(kick1.name).toBe('Kick 1');
		expect(findDrumSynthPresetIndex(kick1.values)).toBe(0);
	});

	it('matches the last preset too', () => {
		const last = DRUM_SYNTH_PRESETS[DRUM_SYNTH_PRESETS.length - 1];
		expect(findDrumSynthPresetIndex(last.values)).toBe(DRUM_SYNTH_PRESETS.length - 1);
	});

	it('returns -1 when a single value drifts off the preset ("none" state)', () => {
		const drifted = [...DRUM_SYNTH_PRESETS[0].values];
		drifted[4] += 1;
		expect(findDrumSynthPresetIndex(drifted)).toBe(-1);
	});

	it('returns -1 for values matching no preset at all', () => {
		expect(findDrumSynthPresetIndex(new Array(15).fill(64))).toBe(-1);
	});
});
