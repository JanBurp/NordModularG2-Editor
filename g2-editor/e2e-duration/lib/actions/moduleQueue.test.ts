import { describe, expect, it } from 'vitest';
import { ModuleQueue } from './moduleQueue';

describe('ModuleQueue', () => {
	it('excludes Hidden modules', () => {
		const q = new ModuleQueue(Math.random);
		expect(q.all.length).toBeGreaterThan(150);
		expect(q.all.some((m) => m.page?.name === 'Hidden')).toBe(false);
	});

	it('hands out every type exactly once per cycle', () => {
		let s = 7;
		const q = new ModuleQueue(() => ((s = (s * 16807) % 2147483647) - 1) / 2147483646);
		for (let cycle = 0; cycle < 2; cycle++) {
			const ids = q.all.map(() => q.next().id);
			expect(new Set(ids).size).toBe(q.all.length);
		}
	});
});
