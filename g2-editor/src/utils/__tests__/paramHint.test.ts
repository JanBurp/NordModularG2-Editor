import { describe, expect, it } from 'vitest';
import { getModule } from '@/renderer/nmg2mods';
import { formatParamDisplay, formatParamHint } from '@/utils/moduleControls';

// OscB: 0 FreqCoarse (combined display with 1 FreqFine, 4 FreqMode), 6 Shape (0..127), 8 Waveform (0..4)
const oscB = getModule(7)!;
const values = [64, 64, 1, 0, 0, 0, 64, 0, 2, 1, 0];
const display = (i: number, v = values) => formatParamDisplay(oscB, i, v);

describe('formatParamHint', () => {
	it('adds the raw value line for 0..127 params', () => {
		expect(formatParamHint(oscB, 6, values)).toBe(`${display(6)}\n(64)`);
	});

	it('shows only the display text for selectors', () => {
		expect(formatParamHint(oscB, 8, values)).toBe(display(8));
		expect(display(8)).not.toContain('\n');
	});

	it('uses the combined display a param leads, with its padding collapsed to one space', () => {
		expect(display(0)).toMatch(/\s{2,}/);
		expect(formatParamHint(oscB, 0, values)).toBe(`${display(0).replace(/\s+/g, ' ')}\n(64)`);
	});

	it('shows value -- morph end, clamped to the param range', () => {
		const v = [...values];
		v[6] = 120;
		const end = [...values];
		end[6] = 127;
		expect(formatParamHint(oscB, 6, v, undefined, 20)).toBe(`${display(6, v)} -- ${display(6, end)}\n(120 -- 127)`);
	});
});
