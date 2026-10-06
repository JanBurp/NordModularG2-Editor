/** Pure picking logic (no Playwright), unit-tested in pick.test.ts. */

export interface Pickable {
	name: string;
	weight: number;
	burst?: boolean;
}

/** Coverage first: an action that hasn't run yet wins; after that, weighted random. Marks the pick as run. */
export function pickAction<T extends Pickable>(pool: T[], rnd: () => number, ran: Set<string>): T {
	const fresh = pool.filter((a) => !ran.has(a.name));
	const a = fresh.length ? fresh[Math.floor(rnd() * fresh.length)] : weighted(pool, rnd);
	ran.add(a.name);
	return a;
}

export function weighted<T extends Pickable>(pool: T[], rnd: () => number): T {
	let r = rnd() * pool.reduce((s, a) => s + a.weight, 0);
	for (const a of pool) if ((r -= a.weight) < 0) return a;
	return pool[pool.length - 1];
}

export const BURST_MIN = 5;
export const BURST_GAP_MS: readonly [number, number] = [100, 400];

/** Whether to start a burst now and, if so, its gaps (one per action, ms). */
export function planBurst(rnd: () => number, p: number, max: number): number[] | null {
	if (rnd() >= p) return null;
	const n = BURST_MIN + Math.floor(rnd() * (Math.max(max, BURST_MIN) - BURST_MIN + 1));
	return Array.from({ length: n }, () => BURST_GAP_MS[0] + Math.floor(rnd() * (BURST_GAP_MS[1] - BURST_GAP_MS[0] + 1)));
}
