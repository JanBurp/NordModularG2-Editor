import { describe, expect, it } from 'vitest';
import { BURST_GAP_MS, BURST_MIN, MAX_TRIES, pickAction, planBurst } from './pick';

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
		const covered = new Set<string>();
		const rnd = rng(1);
		const first = pool.map(() => {
			const name = pickAction(pool, rnd, covered, new Map()).name;
			covered.add(name);
			return name;
		});
		expect(new Set(first).size).toBe(pool.length);
	});

	it('falls back to weights once everything has run', () => {
		const covered = new Set(pool.map((a) => a.name));
		const rnd = rng(2);
		const picks = Array.from({ length: 200 }, () => pickAction(pool, rnd, covered, new Map()).name);
		expect(picks.filter((n) => n === 'a0').length).toBeGreaterThan(180);
	});

	it('stops preferring an uncovered action after MAX_TRIES attempts', () => {
		const covered = new Set(pool.slice(1).map((a) => a.name));
		const rnd = rng(4);
		expect(pickAction(pool.slice(0, 2).reverse(), rnd, new Set(['a1']), new Map([['a0', MAX_TRIES - 1]])).name).toBe('a0');
		const lowA0 = pool.map((a) => (a.name === 'a0' ? { ...a, weight: 0 } : a));
		const picks = Array.from({ length: 50 }, () => pickAction(lowA0, rnd, covered, new Map([['a0', MAX_TRIES]])).name);
		expect(picks).not.toContain('a0');
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
