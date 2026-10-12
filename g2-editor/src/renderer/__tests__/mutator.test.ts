import { describe, expect, it } from 'vitest';
import { defaultPatchParams } from '../../store/slotHelpers';
import type { MorphAssignment } from '../../types/patch';
import {
	applyCurve,
	chromosomePath,
	cross,
	DEFAULT_LOCK_MASK,
	DEFAULT_PROB,
	DEFAULT_RANGE,
	genomeFromVariation,
	interpolate,
	isEnabled,
	linkedProb,
	linkedRange,
	mutate,
	paramMax,
	randomize,
	variationFromGenome,
	type Genome,
	type MutaModules,
} from '../mutator';

const ENV_ADSR = 20; // 0 Shape (envelope), 1-4 A/D/S/R (envelope), 5 OutType (perm. locked)
const OSC_A = 97; // 0 FreqCoarse (OscFreq), 1 FreqFine (OscFine)
const REVERB = 12; // effects module

// Deterministic PRNG (mulberry32) so failures are reproducible.
function seeded(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function genome(voice: Record<number, number[]>, morphs: MorphAssignment[] = []): Genome {
	return genomeFromVariation({ fx: {}, voice, patch: { ...defaultPatchParams(), morphAssignments: morphs } });
}
const modules: MutaModules = { fx: {}, voice: { 1: { type: ENV_ADSR, locked: false }, 2: { type: OSC_A, locked: false } } };
const base = () => genome({ 1: [0, 10, 54, 100, 14, 0, 1, 0], 2: [64, 64, 1, 0, 0, 1, 0] });

describe('isEnabled', () => {
	it('honours permanent locks, module locks and the default Quick Locks', () => {
		expect(isEnabled(ENV_ADSR, false, 1, DEFAULT_LOCK_MASK, 0)).toBe(true); // Attack
		expect(isEnabled(ENV_ADSR, false, 5, DEFAULT_LOCK_MASK, 0)).toBe(false); // OutType
		expect(isEnabled(ENV_ADSR, true, 1, DEFAULT_LOCK_MASK, 0)).toBe(false); // excluded module
		expect(isEnabled(OSC_A, false, 0, DEFAULT_LOCK_MASK, 0)).toBe(false); // OscFreq locked by default
		expect(isEnabled(OSC_A, false, 1, DEFAULT_LOCK_MASK, 0)).toBe(true); // OscFine
	});

	it('Solo replaces the lock mask and excludes uncategorised params', () => {
		expect(isEnabled(OSC_A, false, 0, DEFAULT_LOCK_MASK, 0x01)).toBe(true);
		expect(isEnabled(ENV_ADSR, false, 1, DEFAULT_LOCK_MASK, 0x01)).toBe(false);
		expect(isEnabled(REVERB, false, 0, DEFAULT_LOCK_MASK, 0x80)).toBe(true);
		expect(isEnabled(REVERB, false, 0, DEFAULT_LOCK_MASK & ~0x80, 0)).toBe(false);
	});
});

describe('applyCurve', () => {
	it('stays inside the reachable range for every curve', () => {
		const rng = seeded(1);
		for (const curve of [1, 2, 3, 4] as const)
			for (let i = 0; i < 500; i++) {
				const r = applyCurve(-1, -1, curve, 127, rng);
				expect(r).toBeGreaterThanOrEqual(0);
				expect(r).toBeLessThanOrEqual(127.999);
			}
	});

	it('biases Randomize low for curve 2 and high for curve 3', () => {
		const mean = (curve: 2 | 3) => {
			const rng = seeded(7);
			let s = 0;
			for (let i = 0; i < 2000; i++) s += applyCurve(-1, -1, curve, 127, rng);
			return s / 2000;
		};
		expect(mean(2)).toBeLessThan(50);
		expect(mean(3)).toBeGreaterThan(78);
	});
});

describe('mutate / randomize', () => {
	it('probability 0 leaves the genome unchanged', () => {
		expect(mutate(base(), modules, 0, 0.5, DEFAULT_LOCK_MASK, 0, seeded(2))).toEqual(base());
	});

	it('only touches enabled params and keeps them in range', () => {
		const rng = seeded(3);
		for (let i = 0; i < 50; i++) {
			const g = mutate(base(), modules, 1, 0.5, DEFAULT_LOCK_MASK, 0, rng);
			expect(g.voice[1][5]).toBe(base().voice[1][5]); // OutType
			expect(g.voice[2][0]).toBe(base().voice[2][0]); // OscFreq (locked)
			for (const [idx, vals] of Object.entries(g.voice))
				vals.forEach((v, p) => {
					expect(v).toBeGreaterThanOrEqual(0);
					expect(v).toBeLessThan(paramMax(modules.voice[Number(idx)].type, p) + 1);
				});
		}
	});

	it('randomize leaves excluded modules alone', () => {
		const locked: MutaModules = { fx: {}, voice: { ...modules.voice, 1: { type: ENV_ADSR, locked: true } } };
		expect(randomize(base(), locked, DEFAULT_LOCK_MASK, 0, seeded(4)).voice[1]).toEqual(base().voice[1]);
	});
});

describe('interpolate / cross', () => {
	const m = genome({ 1: [0, 0, 0, 0, 0, 0, 0, 0] }, [{ groupIndex: 0, location: 1, moduleIndex: 1, paramIndex: 1, range: 10 }]);
	const f = genome({ 1: [3, 127, 127, 127, 127, 5, 1, 1] }, [{ groupIndex: 0, location: 1, moduleIndex: 1, paramIndex: 1, range: 80 }]);

	it('interpolates every param (ignoring locks) and morph ranges', () => {
		const g = interpolate(m, f, 3 / 7);
		expect(g.voice[1][1]).toBeCloseTo(0.5 + (127 * 3) / 7);
		expect(g.voice[1][5]).toBeCloseTo(0.5 + (5 * 3) / 7);
		expect(g.patch.morphAssignments[0].range).toBe(Math.trunc(10 + (70 * 3) / 7));
	});

	it('cross with probability 0 copies one whole parent per context', () => {
		for (let s = 0; s < 10; s++) {
			const g = cross(m, f, 0, seeded(s));
			expect([m.voice[1], f.voice[1]]).toContainEqual(g.voice[1]);
		}
	});

	it('cross copies the morph ranges of the chosen parent', () => {
		const g = cross(m, f, 0, seeded(5));
		const fromFather = g.voice[1][1] === f.voice[1][1];
		expect(g.patch.morphAssignments[0].range).toBe(fromFather ? 80 : 10);
	});
});

describe('link, genome conversion and chromosome', () => {
	it('link formulas are each other’s inverse and reproduce the defaults', () => {
		expect(linkedRange(DEFAULT_PROB)).toBeCloseTo(DEFAULT_RANGE, 3);
		expect(linkedProb(linkedRange(0.5))).toBeCloseTo(0.5, 6);
	});

	it('genome round-trips to integer values', () => {
		const v = variationFromGenome(base());
		expect(v.voice[1]).toEqual([0, 10, 54, 100, 14, 0, 1, 0]);
	});

	it('chromosome has one point per value plus start and end', () => {
		const pts = chromosomePath(base());
		expect(pts.length).toBe(1 + 8 + 7 + 1 + 1);
		expect(pts[0]).toEqual([0, 0]);
	});
});
