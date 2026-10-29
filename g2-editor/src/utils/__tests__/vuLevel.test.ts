import { describe, it, expect } from 'vitest';
import { vuFraction, vuMetersByLedNo } from '../vuLevel';
import { getModule } from '../../renderer/nmg2mods';

describe('vuFraction', () => {
	it('is 0 for silence and the off marker 255', () => {
		expect(vuFraction(0)).toBe(0);
		expect(vuFraction(1)).toBe(0);
		expect(vuFraction(255)).toBe(0);
	});

	it('rises monotonically on a log curve, just below full at 127', () => {
		expect(vuFraction(127)).toBeCloseTo(Math.log10(127) * 0.45);
		for (let v = 2; v <= 127; v++) expect(vuFraction(v)).toBeGreaterThan(vuFraction(v - 1));
	});
});

describe('vuMetersByLedNo', () => {
	it('orders the meters by x (4-In lists them right to left)', () => {
		expect(vuMetersByLedNo(getModule(171)).map((v) => v.x)).toEqual([153, 179, 205, 231]);
	});

	it('is empty for a module without meters', () => {
		expect(vuMetersByLedNo(undefined)).toEqual([]);
	});
});
