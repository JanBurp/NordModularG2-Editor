import { describe, expect, it } from 'vitest';
import { BURST_GAP_MS, BURST_MIN, pickAction, planBurst } from './pick';

// mulberry32, same PRNG as duration.spec.ts
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('pickAction', () => {
	const pool = Array.from({ length: 12 }, (_, i) => ({ name: `a${i}`, weight: i === 0 ? 1000 : 1 }));

	it('runs every action once before repeating any, despite skewed weights', () => {
		const ran = new Set<string>();
		const rnd = rng(1);
		const first = pool.map(() => pickAction(pool, rnd, ran).name);
		expect(new Set(first).size).toBe(pool.length);
	});

	it('falls back to weights once everything has run', () => {
		const ran = new Set(pool.map((a) => a.name));
		const rnd = rng(2);
		const picks = Array.from({ length: 200 }, () => pickAction(pool, rnd, ran).name);
		expect(picks.filter((n) => n === 'a0').length).toBeGreaterThan(180);
	});
});

describe('planBurst', () => {
	it('never bursts with p=0 and always with p=1', () => {
		const rnd = rng(3);
		expect(planBurst(rnd, 0, 15)).toBeNull();
		expect(planBurst(rnd, 1, 15)).not.toBeNull();
	});

	it('keeps size and gaps within bounds', () => {
		const rnd = rng(4);
		for (let i = 0; i < 100; i++) {
			const gaps = planBurst(rnd, 1, 15)!;
			expect(gaps.length).toBeGreaterThanOrEqual(BURST_MIN);
			expect(gaps.length).toBeLessThanOrEqual(15);
			for (const g of gaps) {
				expect(g).toBeGreaterThanOrEqual(BURST_GAP_MS[0]);
				expect(g).toBeLessThanOrEqual(BURST_GAP_MS[1]);
			}
		}
	});
});
