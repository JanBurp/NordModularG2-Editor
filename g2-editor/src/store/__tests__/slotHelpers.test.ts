import { describe, expect, it } from 'vitest';
import {
	buildCloneEntries,
	buildPasteParamsPairs,
	freeModuleIds,
	isCableSourceEnd,
	MAX_MODULE_INDEX,
	resolveColumnCollisions,
	resolvePasteRowOffset,
} from '../slotHelpers';

function mod(index: number, type: number, pcnt: number, lv: number[], modes: number[]): any {
	return { index, type, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt, lv, modes };
}

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

describe('buildPasteParamsPairs', () => {
	it('pairs by order and slices lv at the copied variation', () => {
		const source = [mod(1, 5, 2, [1, 2, 3, 4], [9])];
		const current = [mod(10, 5, 2, [], [])];
		expect(buildPasteParamsPairs(source, 1, [10], current)).toEqual([{ targetId: 10, paramValues: [3, 4], modeValues: [9] }]);
	});

	it('skips a pair when the target module type differs', () => {
		const source = [mod(1, 5, 1, [7], [0])];
		const current = [mod(10, 6, 1, [], [])];
		expect(buildPasteParamsPairs(source, 0, [10], current)).toEqual([]);
	});

	it('skips a pair when the target id does not exist', () => {
		const source = [mod(1, 5, 1, [7], [0])];
		expect(buildPasteParamsPairs(source, 0, [999], [])).toEqual([]);
	});

	it('only pairs the overlapping prefix when source and target counts differ', () => {
		const source = [mod(1, 5, 1, [7], []), mod(2, 6, 1, [8], [])];
		const current = [mod(10, 5, 1, [], [])];
		expect(buildPasteParamsPairs(source, 0, [10], current)).toEqual([{ targetId: 10, paramValues: [7], modeValues: [] }]);
	});
});

describe('freeModuleIds', () => {
	const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

	it('starts at 1 in an empty area', () => {
		expect(freeModuleIds([], 2)).toEqual([1, 2]);
	});

	it('reuses the lowest gaps instead of max+1', () => {
		expect(freeModuleIds([1, 3, 4, 7], 3)).toEqual([2, 5, 6]);
	});

	it('never hands out an index above 127', () => {
		expect(freeModuleIds(range(1, 126), 1)).toEqual([127]);
		expect(freeModuleIds(range(1, MAX_MODULE_INDEX), 1)).toBeNull();
		expect(freeModuleIds(range(2, 127), 2)).toBeNull();
	});
});

describe('buildCloneEntries', () => {
	it('assigns free indices and remaps cables onto them', () => {
		const src = [mod(5, 97, 0, [], []), mod(9, 92, 0, [], [])];
		const cables = [{ smod: 5, dmod: 9, colour: 0, scon: 0, dcon: 0, dir: 1 }] as any;
		const r = buildCloneEntries(src, cables, [1, 2, 4], 0, 0)!;
		expect(r.entries.map((e) => e.newId)).toEqual([3, 5]);
		expect(r.remappedCables[0]).toMatchObject({ newSmod: 3, newDmod: 5 });
	});

	it('returns null when the area has no room', () => {
		const used = Array.from({ length: 126 }, (_, i) => i + 1);
		expect(buildCloneEntries([mod(1, 97, 0, [], []), mod(2, 92, 0, [], [])], [], used, 0, 0)).toBeNull();
	});
});

describe('isCableSourceEnd', () => {
	const cable = (smod: number, scon: number, dir: number, dmod: number, dcon: number): any => ({ colour: 0, smod, scon, dir, dmod, dcon });

	it('treats the input end of an output→input self-loop as the dmod end', () => {
		const loop = cable(3, 0, 1, 3, 0);
		expect(isCableSourceEnd(loop, { moduleIndex: 3, connectorIndex: 0, type: 'input' })).toBe(false);
		expect(isCableSourceEnd(loop, { moduleIndex: 3, connectorIndex: 0, type: 'output' })).toBe(true);
	});

	it('resolves both ends of an input→input cable', () => {
		const chain = cable(1, 0, 0, 2, 1);
		expect(isCableSourceEnd(chain, { moduleIndex: 1, connectorIndex: 0, type: 'input' })).toBe(true);
		expect(isCableSourceEnd(chain, { moduleIndex: 2, connectorIndex: 1, type: 'input' })).toBe(false);
	});
});
