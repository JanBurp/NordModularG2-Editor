import { describe, expect, it } from 'vitest';
import { findConnectedInputCables, findGroupOutputColor, inferUserColours } from '../cableGraph';
import type { Cable } from '@/renderer/cableRenderer';
import type { ModuleDefinition } from '@/types/module';

function cable(smod: number, scon: number, dmod: number, dcon: number, dir: number, colour = 1): Cable {
	return { smod, scon, dmod, dcon, dir, colour } as Cable;
}

function moduleDef(outputColour: string): ModuleDefinition {
	return { id: 0, short: '', long: '', height: 1, outputs: [{ name: '', colour: outputColour, x: 0, y: 0 }] } as ModuleDefinition;
}

describe('findConnectedInputCables', () => {
	it('returns empty for empty cable list', () => {
		expect(findConnectedInputCables([], 1, 0)).toEqual([]);
	});

	it('returns empty when no cables touch the start jack', () => {
		const cables = [cable(2, 0, 3, 0, 0)];
		expect(findConnectedInputCables(cables, 1, 0)).toEqual([]);
	});

	it('finds a single input-input cable connected to the start jack', () => {
		const c = cable(1, 0, 2, 0, 0);
		expect(findConnectedInputCables([c], 1, 0)).toEqual([c]);
	});

	it('follows a chain of input-input cables via BFS', () => {
		const c1 = cable(1, 0, 2, 0, 0);
		const c2 = cable(2, 0, 3, 0, 0);
		const c3 = cable(3, 0, 4, 0, 0);
		const result = findConnectedInputCables([c1, c2, c3], 1, 0);
		expect(result).toContain(c1);
		expect(result).toContain(c2);
		expect(result).toContain(c3);
		expect(result).toHaveLength(3);
	});

	it('ignores dir=1 (output) cables', () => {
		const c = cable(1, 0, 2, 0, 1);
		expect(findConnectedInputCables([c], 1, 0)).toEqual([]);
	});

	it('handles connection from destination side', () => {
		const c = cable(2, 0, 1, 0, 0);
		expect(findConnectedInputCables([c], 1, 0)).toEqual([c]);
	});
});

describe('findGroupOutputColor', () => {
	it('returns 6 (white) when no output is connected', () => {
		expect(findGroupOutputColor([], 1, 0, 2, 0)).toBe(6);
	});

	it('returns 6 when only input-input cables exist', () => {
		const cables = [cable(1, 0, 2, 0, 0, 3)];
		expect(findGroupOutputColor(cables, 1, 0, 2, 0)).toBe(6);
	});

	it('returns colour of output driving a jack in the group', () => {
		// output cable from module 0 driving module 1's input
		const out = cable(0, 0, 1, 0, 1, 4);
		expect(findGroupOutputColor([out], 1, 0, 2, 0)).toBe(4);
	});

	it('returns output colour when output drives a transitively connected jack', () => {
		// input-input chain: mod1.0 <-> mod2.0, then output drives mod2.0
		const inp = cable(1, 0, 2, 0, 0, 1);
		const out = cable(0, 0, 2, 0, 1, 7);
		expect(findGroupOutputColor([inp, out], 1, 0, 3, 0)).toBe(7);
	});
});

describe('inferUserColours', () => {
	it('leaves a cable un-pinned when its stored colour matches the computed default', () => {
		// module 0 has a blue output (index 1); cable already stored as blue.
		const c = cable(0, 0, 1, 0, 1, 1);
		const modDefs = new Map([[0, moduleDef('blue')]]);
		const result = inferUserColours([c], new Set(), modDefs);
		expect(result[0].userColour).toBeUndefined();
	});

	it('pins a cable whose stored colour disagrees with the computed default', () => {
		// module 0 has a blue output (index 1); cable was manually forced to red (index 0).
		const c = cable(0, 0, 1, 0, 1, 0);
		const modDefs = new Map([[0, moduleDef('blue')]]);
		const result = inferUserColours([c], new Set(), modDefs);
		expect(result[0].userColour).toBe(0);
		expect(result[0].colour).toBe(0);
	});

	it('leaves an already-pinned cable untouched', () => {
		const c = { ...cable(0, 0, 1, 0, 1, 0), userColour: 5 } as Cable;
		const modDefs = new Map([[0, moduleDef('blue')]]);
		const result = inferUserColours([c], new Set(), modDefs);
		expect(result[0]).toBe(c);
	});

	it('pins a dir=0 cable only when it disagrees with the driving output colour', () => {
		// output (mod0->mod1, blue/index 1) drives an input group also containing mod1<->mod2 (dir=0).
		const out = cable(0, 0, 1, 0, 1, 1);
		const matching = cable(1, 0, 2, 0, 0, 1); // already matches driving colour
		const mismatched = cable(2, 0, 3, 0, 0, 4); // manually forced to green, disagrees
		const modDefs = new Map([[0, moduleDef('blue')]]);
		const result = inferUserColours([out, matching, mismatched], new Set(), modDefs);
		expect(result[1].userColour).toBeUndefined();
		expect(result[2].userColour).toBe(4);
	});
});
