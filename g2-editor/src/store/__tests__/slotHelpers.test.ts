import { describe, expect, it } from 'vitest';
import { resolveColumnCollisions, resolvePasteRowOffset } from '../slotHelpers';

describe('resolveColumnCollisions', () => {
	it('returns empty when no occupants', () => {
		const mods = [{ index: 1, vert: 0, height: 2 }];
		expect(resolveColumnCollisions(mods, [])).toEqual([]);
	});

	it('returns empty when no collision', () => {
		const mods = [{ index: 1, vert: 0, height: 2 }];
		const occupants = [{ row: 10, height: 2 }];
		expect(resolveColumnCollisions(mods, occupants)).toEqual([]);
	});

	it('pushes a module down when it overlaps an occupant', () => {
		const mods = [{ index: 1, vert: 0, height: 2 }];
		const occupants = [{ row: 0, height: 2 }];
		expect(resolveColumnCollisions(mods, occupants)).toEqual([{ index: 1, newRow: 2 }]);
	});

	it('handles multiple modules pushed down in order', () => {
		const mods = [
			{ index: 1, vert: 0, height: 2 },
			{ index: 2, vert: 2, height: 2 },
		];
		const occupants = [{ row: 0, height: 4 }];
		const result = resolveColumnCollisions(mods, occupants);
		expect(result.find((r) => r.index === 1)?.newRow).toBe(4);
		expect(result.find((r) => r.index === 2)?.newRow).toBe(6);
	});

	it('only returns modules that actually moved', () => {
		const mods = [
			{ index: 1, vert: 0, height: 2 },
			{ index: 2, vert: 10, height: 2 },
		];
		const occupants = [{ row: 0, height: 2 }];
		const result = resolveColumnCollisions(mods, occupants);
		expect(result.some((r) => r.index === 2)).toBe(false);
	});

	it('respects floor: consecutive modules do not overlap each other after push', () => {
		const mods = [
			{ index: 1, vert: 0, height: 3 },
			{ index: 2, vert: 1, height: 3 },
		];
		const occupants = [{ row: 0, height: 2 }];
		const result = resolveColumnCollisions(mods, occupants);
		const r1 = result.find((r) => r.index === 1)!;
		const r2 = result.find((r) => r.index === 2)!;
		expect(r1.newRow).toBe(2);
		expect(r2.newRow).toBe(5); // pushed past r1's end (2+3=5)
	});
});

describe('resolvePasteRowOffset', () => {
	it('leaves dRow unchanged when the target column differs from the source', () => {
		const mods = [{ vert: 0, height: 2 }];
		expect(resolvePasteRowOffset(mods, 1, 0)).toBe(0);
	});

	it('leaves dRow unchanged when the target row does not overlap the source', () => {
		const mods = [{ vert: 0, height: 2 }];
		expect(resolvePasteRowOffset(mods, 0, 5)).toBe(5);
	});

	it('places a single module directly below the source when paste lands on it', () => {
		const mods = [{ vert: 0, height: 2 }];
		expect(resolvePasteRowOffset(mods, 0, 0)).toBe(2);
	});

	it('places the whole group below its bounding box when paste lands on any source module', () => {
		const mods = [
			{ vert: 0, height: 2 },
			{ vert: 2, height: 4 },
		];
		expect(resolvePasteRowOffset(mods, 0, 0)).toBe(6);
	});
});
