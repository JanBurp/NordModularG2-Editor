import { describe, expect, it } from 'vitest';
import { knobAngle } from '@/utils/knobArc';

describe('knobAngle', () => {
	it('keeps the 0..127 mapping unchanged', () => {
		expect(knobAngle(0)).toBe(-135);
		expect(knobAngle(64)).toBe(0);
		expect(knobAngle(127)).toBeCloseTo((127 / 128) * 270 - 135);
	});

	it('sweeps the full arc for a smaller param range (Compressor RefLevel 0..42)', () => {
		expect(knobAngle(0, 42)).toBe(-135);
		expect(knobAngle(42, 42)).toBeCloseTo(knobAngle(127));
		expect(knobAngle(99, 99)).toBeCloseTo(knobAngle(127));
	});

	it('clamps to the param range', () => {
		expect(knobAngle(60, 42)).toBeCloseTo(knobAngle(42, 42));
	});
});
