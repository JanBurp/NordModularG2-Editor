import { describe, expect, it } from 'vitest';
import { describeArc, knobAngle } from '@/utils/knobArc';

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

describe('describeArc', () => {
	it('draws a clockwise arc, large-arc only beyond 180°', () => {
		expect(describeArc(0, 0, 10, -90, 0)).toMatch(/^M -10 \S+ A 10 10 0 0 1 0 -10$/);
		expect(describeArc(0, 0, 10, -135, 135)).toMatch(/A 10 10 0 1 1 /);
	});
});
