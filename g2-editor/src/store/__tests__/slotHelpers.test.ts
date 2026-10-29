import { describe, expect, it } from 'vitest';
import {
	buildCloneEntries,
	computeAssignRows,
	buildPasteParamsPairs,
	canPasteParams,
	freeModuleIds,
	isCableSourceEnd,
	isUnusedModule,
	assignedModules,
	MAX_MODULE_INDEX,
	moduleActionTargets,
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
	it('slices lv at the copied variation and copies modes', () => {
		const source = [mod(1, 5, 2, [1, 2, 3, 4], [9])];
		const current = [mod(10, 5, 2, [], [])];
		expect(buildPasteParamsPairs(source, 1, [10], current, undefined, 1)).toEqual([
			{ targetId: 10, paramValues: [3, 4], modeValues: [9], morphs: undefined },
		]);
	});

	it('pairs by type, not by selection order', () => {
		const source = [mod(1, 5, 1, [7], []), mod(2, 6, 1, [8], [])];
		const current = [mod(10, 6, 1, [], []), mod(11, 5, 1, [], [])];
		expect(buildPasteParamsPairs(source, 0, [10, 11], current, undefined, 1)?.map((p) => [p.targetId, p.paramValues])).toEqual([
			[11, [7]],
			[10, [8]],
		]);
	});

	it('returns null when the counts differ', () => {
		const source = [mod(1, 5, 1, [7], []), mod(2, 5, 1, [8], [])];
		const current = [mod(10, 5, 1, [], [])];
		expect(buildPasteParamsPairs(source, 0, [10], current, undefined, 1)).toBeNull();
		expect(buildPasteParamsPairs([source[0]], 0, [], current, undefined, 1)).toBeNull();
	});

	it('returns null when a type differs or a target id does not exist', () => {
		const source = [mod(1, 5, 1, [7], [0])];
		expect(buildPasteParamsPairs(source, 0, [10], [mod(10, 6, 1, [], [])], undefined, 1)).toBeNull();
		expect(buildPasteParamsPairs(source, 0, [999], [], undefined, 1)).toBeNull();
	});

	it("moves the copied variation's morphs onto the target id and location", () => {
		const source = [mod(1, 5, 1, [7, 7], [])];
		const morphs: any[][] = [
			[],
			[
				{ groupIndex: 2, location: 0, moduleIndex: 1, paramIndex: 0, range: 40 },
				{ groupIndex: 0, location: 0, moduleIndex: 3, paramIndex: 0, range: 9 },
			],
		];
		const pairs = buildPasteParamsPairs(source, 1, [10], [mod(10, 5, 1, [], [])], morphs, 1);
		expect(pairs?.[0].morphs).toEqual([{ groupIndex: 2, location: 1, moduleIndex: 10, paramIndex: 0, range: 40 }]);
	});
});

describe('moduleActionTargets', () => {
	it('targets the selection when the module is part of it', () => {
		expect(moduleActionTargets({ selectedModules: [1, 4], selectedModulesArea: 'va' }, 4, 'va')).toEqual([1, 4]);
	});

	it('targets only the module when it is not selected', () => {
		expect(moduleActionTargets({ selectedModules: [1, 4], selectedModulesArea: 'va' }, 2, 'va')).toEqual([2]);
	});

	it('ignores a selection in the other area with the same module index', () => {
		expect(moduleActionTargets({ selectedModules: [1, 4], selectedModulesArea: 'fx' }, 1, 'va')).toEqual([1]);
	});
});

describe('canPasteParams', () => {
	const current = [mod(10, 5, 1, [], []), mod(11, 6, 1, [], []), mod(12, 5, 1, [], [])];
	it('accepts the same multiset of types in any order', () => {
		expect(canPasteParams([6, 5], [10, 11], current)).toBe(true);
		expect(canPasteParams([5, 5], [12, 10], current)).toBe(true);
	});
	it('rejects an empty clipboard, a count mismatch or a type mismatch', () => {
		expect(canPasteParams([], [], current)).toBe(false);
		expect(canPasteParams([5], [10, 12], current)).toBe(false);
		expect(canPasteParams([5, 5], [10, 11], current)).toBe(false);
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

describe('isUnusedModule', () => {
	const cables: any[] = [{ smod: 1, scon: 0, dmod: 2, dcon: 0, dir: 1 }];
	const name = (uname: string, colour = 0): any => ({ ...mod(3, 126, 0, [], []), uname, colour });

	it('is false for a module on either end of a cable', () => {
		expect(isUnusedModule(mod(1, 7, 0, [], []), cables, new Set())).toBe(false);
		expect(isUnusedModule(mod(2, 7, 0, [], []), cables, new Set())).toBe(false);
	});

	it('is true for a module without cables', () => {
		expect(isUnusedModule(mod(4, 7, 0, [], []), cables, new Set())).toBe(true);
	});

	it('only counts a Name module with its default name and colour', () => {
		expect(isUnusedModule(name('Name1'), cables, new Set())).toBe(true);
		expect(isUnusedModule(name('Lead'), cables, new Set())).toBe(false);
		expect(isUnusedModule(name('Name1', 3), cables, new Set())).toBe(false);
	});

	it('is false for a module with a Parameter Page or MIDI CC assignment', () => {
		expect(isUnusedModule(mod(4, 7, 0, [], []), cables, new Set([4]))).toBe(false);
	});
});

describe('assignedModules', () => {
	it('collects CC and Parameter Page modules of the given location', () => {
		const slot: any = {
			controllers: [
				{ location: 1, moduleIndex: 1 },
				{ location: 0, moduleIndex: 2 },
			],
			paramPages: [
				{ location: 1, moduleIndex: 3 },
				{ location: 0, moduleIndex: 4 },
			],
		};
		expect(assignedModules(slot, 1)).toEqual(new Set([1, 3]));
		expect(assignedModules(slot, 0)).toEqual(new Set([2, 4]));
	});
});

describe('computeAssignRows', () => {
	const meter = (slotIndex: number, moduleIndex: number) => ({ slotIndex, location: 1 as const, moduleIndex, paramIndex: 0, isLed: 1 });
	const param = (slotIndex: number) => ({ slotIndex, location: 1 as const, moduleIndex: 9, paramIndex: 3, isLed: 0 });

	it('clears the whole target rows, fills them and moves items already assigned elsewhere', () => {
		const prev = [param(9), param(15), meter(40, 2), param(41)];
		const { next, touched } = computeAssignRows(
			prev,
			1,
			[[2, 5]],
			(k) => k.isLed === 1 && [2, 5].includes(k.moduleIndex),
			(m: number, slotIndex) => meter(slotIndex, m),
		);
		expect(next).toEqual([param(41), meter(8, 2), meter(9, 5)]);
		expect(touched).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 40]);
	});
});
