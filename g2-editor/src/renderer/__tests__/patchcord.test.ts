import { describe, it, expect } from 'vitest';
import { twistAngle, cableControlPoints, newCableSeed, Patchcord } from '../patchcord';

describe('twistAngle (G2Editor.c TwistAngel)', () => {
	// a = 0, so the result is the zig-zag offset at v = phi
	it.each([
		[-Math.PI, 0],
		[-Math.PI / 2, -Math.PI / 3],
		[0, Math.PI / 3],
		[Math.PI / 2, -Math.PI / 3],
		[Math.PI, 0],
	])('offset at v=%f is %f', (v, expected) => {
		expect(twistAngle(0, v)).toBeCloseTo(expected, 9);
	});

	it('wraps angles beyond +-pi', () => {
		expect(twistAngle(0, 2 * Math.PI)).toBeCloseTo(twistAngle(0, 0), 9);
	});
});

describe('cableControlPoints', () => {
	it('matches hand-computed reference values (long horizontal cable, seed 0)', () => {
		// phi = sin(200)*2pi, len = 200/5 + 9 = 49.
		// A: v = 0.796 -> offset -0.0141 rad -> (49, -0.7). B: angle pi, v = -2.345 -> offset -0.531 rad -> (200-42.2, 25.0).
		expect(cableControlPoints(0, 0, 200, 0, 50, 0)).toEqual([
			[49, -1],
			[158, 25],
		]);
	});

	it('gravity 0 puts control points on the endpoints (straight line)', () => {
		expect(cableControlPoints(10, 20, 300, 90, 0, 7)).toEqual([
			[10, 20],
			[300, 90],
		]);
	});

	it('handle length scales with gravity (100 is longer than 50)', () => {
		const dist = (g: number) => {
			const [[x, y]] = cableControlPoints(0, 0, 400, 0, g, 3);
			return Math.hypot(x, y);
		};
		expect(dist(100)).toBeGreaterThan(dist(50));
		expect(dist(50)).toBeGreaterThan(dist(25));
	});

	it('is deterministic per seed and changes with it', () => {
		const a = cableControlPoints(0, 0, 250, 80, 50, 5);
		expect(cableControlPoints(0, 0, 250, 80, 50, 5)).toEqual(a);
		expect(cableControlPoints(0, 0, 250, 80, 50, 6)).not.toEqual(a);
	});

	it('is symmetric when the endpoints are swapped (short cable too)', () => {
		for (const [bx, by] of [
			[250, 80],
			[60, 20],
			[30, -10],
		]) {
			const [p, q] = cableControlPoints(0, 0, bx, by, 50, 9);
			const [q2, p2] = cableControlPoints(bx, by, 0, 0, 50, 9);
			expect(q2).toEqual(q);
			expect(p2).toEqual(p);
		}
	});
});

describe('Patchcord / newCableSeed', () => {
	it('emits a single cubic path from dst to src', () => {
		expect(new Patchcord(200, 0, 0, 0).getCurvePath(0)).toBe('M0 0C0 0,200 0,200 0');
	});

	it('newCableSeed returns an integer byte', () => {
		for (let i = 0; i < 50; i++) {
			const s = newCableSeed();
			expect(Number.isInteger(s) && s >= 0 && s <= 255).toBe(true);
		}
	});
});
