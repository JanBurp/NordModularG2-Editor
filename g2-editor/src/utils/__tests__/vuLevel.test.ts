import { describe, it, expect } from 'vitest';
import { vuSegments, VU_ZONES, vuMetersByLedNo, vuLevelDb, vuClipped, VU_DB_FLOOR } from '../vuLevel';
import { getModule } from '../../renderer/nmg2mods';

// Lit segments, bottom first, as a string: g/y/r = lit green/yellow/red, . = unlit
const lit = (raw: number) =>
	vuSegments(raw)
		.map((s, i) => (s.color === VU_ZONES.find((z) => i < z.to)!.lit ? 'gggggggyyyyr'[i] : '.'))
		.join('');

describe('vuSegments (official CPnlPeakMeter rules)', () => {
	it('lights one segment per step: 7 green, 4 yellow, red at 12', () => {
		expect(lit(0)).toBe('............');
		expect(lit(1)).toBe('g...........');
		expect(lit(7)).toBe('ggggggg.....');
		expect(lit(9)).toBe('gggggggyy...');
		expect(lit(11)).toBe('gggggggyyyy.');
		expect(lit(12)).toBe('gggggggyyyyr');
	});

	it('hold bits 0x10/0x20 light the top two yellows, clip bit 0x40 the red', () => {
		expect(lit(3 | 0x20)).toBe('ggg......yy.');
		expect(lit(3 | 0x10)).toBe('ggg......yy.');
		expect(lit(5 | 0x40)).toBe('ggggg......r');
	});

	it('sizes the segments as the original: 1 unit each, red 3, of 14', () => {
		const segs = vuSegments(0);
		expect(segs[0]).toMatchObject({ from: 0, to: 1 / 14 });
		expect(segs[10]).toMatchObject({ from: 10 / 14, to: 11 / 14 });
		expect(segs[11]).toMatchObject({ from: 11 / 14, to: 1 });
	});

	it('treats 255 (nothing received) as all off', () => {
		expect(lit(255)).toBe('............');
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

describe('vuLevelDb', () => {
	it('follows the measured one-step-per-octave law, skipping above full scale', () => {
		expect([1, 2, 7, 9, 11, 12].map(vuLevelDb)).toEqual([-42, -36, -6, 0, 6, 12]);
	});

	it('ignores the hold/clip bits and puts silence and off at the floor', () => {
		expect(vuLevelDb(11 | 0x20)).toBe(6);
		expect(vuLevelDb(12 | 0x40)).toBe(12);
		expect(vuLevelDb(0)).toBe(VU_DB_FLOOR);
		expect(vuLevelDb(255)).toBe(VU_DB_FLOOR);
	});
});

describe('vuClipped', () => {
	it('is step 12 or the clip bit, never off', () => {
		expect(vuClipped(12)).toBe(true);
		expect(vuClipped(7 | 0x40)).toBe(true);
		expect(vuClipped(11 | 0x20)).toBe(false);
		expect(vuClipped(255)).toBe(false);
	});
});
