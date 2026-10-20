import { describe, expect, it } from 'vitest';
import { isValidInArea } from '../../../src/renderer/nmg2mods';
import { ModuleQueue } from './moduleQueue';

describe('ModuleQueue', () => {
	it('excludes Hidden modules', () => {
		const q = new ModuleQueue(Math.random);
		expect(q.all.length).toBeGreaterThan(150);
		expect(q.all.some((m) => m.page?.name === 'Hidden')).toBe(false);
	});

	it('keeps a type pending until it is added', () => {
		const q = new ModuleQueue(() => 0);
		const def = q.next()!;
		expect(q.next()).toBe(def);
		q.added(def);
		expect(q.next()).not.toBe(def);
		expect(q.remaining).toBe(q.all.length - 1);
	});

	it('only hands out types the filter accepts (no Fx-In for the voice area)', () => {
		const q = new ModuleQueue(Math.random);
		const voice = (d: { id: number }) => isValidInArea(d.id, 'voice');
		for (const d of q.all.filter(voice)) q.added(d);
		expect(q.next(voice)).toBeUndefined();
		expect(q.next()?.short).toBe('Fx-In');
	});

	it('remaining reaches 0 after every type was added, then a new cycle starts', () => {
		let s = 7;
		const q = new ModuleQueue(() => ((s = (s * 16807) % 2147483647) - 1) / 2147483646);
		const ids = q.all.map(() => {
			const d = q.next()!;
			q.added(d);
			return d.id;
		});
		expect(new Set(ids).size).toBe(q.all.length);
		expect(q.remaining).toBe(0);
		expect(q.next()).toBeDefined();
	});
});
