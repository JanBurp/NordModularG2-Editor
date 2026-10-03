import { describe, expect, it } from 'vitest';
import {
	autoRecolorCables,
	computeUprateSet,
	findConnectedInputCables,
	findDrivingOutputCable,
	findGroupOutputColor,
	findJackNestCables,
	inferUserColours,
} from '../cableGraph';
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

describe('findDrivingOutputCable', () => {
	it('returns null when no output drives the jack', () => {
		expect(findDrivingOutputCable([], 1, 0)).toBeNull();
	});

	it('returns the output cable driving the jack directly', () => {
		const out = cable(0, 0, 1, 0, 1, 4);
		expect(findDrivingOutputCable([out], 1, 0)).toBe(out);
	});

	it('returns the output cable driving a transitively connected jack', () => {
		const inp = cable(1, 0, 2, 0, 0);
		const out = cable(0, 0, 2, 0, 1, 7);
		expect(findDrivingOutputCable([inp, out], 1, 0)).toBe(out);
	});

	it('distinguishes two nests driven by two different outputs', () => {
		const outA = cable(0, 0, 1, 0, 1, 1);
		const outB = cable(0, 1, 2, 0, 1, 2);
		expect(findDrivingOutputCable([outA, outB], 1, 0)).toBe(outA);
		expect(findDrivingOutputCable([outA, outB], 2, 0)).toBe(outB);
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

describe('findJackNestCables', () => {
	it('hovering an unstacked input with a direct driver returns just that driver cable', () => {
		const out = cable(0, 0, 1, 0, 1, 4);
		expect(findJackNestCables([out], 1, 0, 'input')).toEqual([out]);
	});

	it('hovering an input in a stack driven by one output returns all stack cables plus the driver', () => {
		const c1 = cable(1, 0, 2, 0, 0);
		const c2 = cable(2, 0, 3, 0, 0);
		const out = cable(0, 0, 3, 0, 1, 7);
		const result = findJackNestCables([c1, c2, out], 1, 0, 'input');
		expect(result).toContain(c1);
		expect(result).toContain(c2);
		expect(result).toContain(out);
		expect(result).toHaveLength(3);
	});

	it('hovering an input in a stack with no driver returns only the stack cables', () => {
		const c1 = cable(1, 0, 2, 0, 0);
		expect(findJackNestCables([c1], 1, 0, 'input')).toEqual([c1]);
	});

	it('hovering a jack in the middle of a stack returns the same whole nest as hovering its start', () => {
		const c1 = cable(1, 0, 2, 0, 0);
		const c2 = cable(2, 0, 3, 0, 0);
		const out = cable(0, 0, 3, 0, 1, 7);
		const result = findJackNestCables([c1, c2, out], 2, 0, 'input');
		expect(result).toContain(c1);
		expect(result).toContain(c2);
		expect(result).toContain(out);
		expect(result).toHaveLength(3);
	});

	it("hovering an output that fans out to two destinations reveals both, plus a stacked destination's stack-mates", () => {
		const toStacked = cable(0, 0, 1, 0, 1, 4); // fans out to module 1, which is stacked with module 2
		const toPlain = cable(0, 0, 3, 0, 1, 4); // second fan-out destination, unstacked
		const stackMate = cable(1, 0, 2, 0, 0);
		const result = findJackNestCables([toStacked, toPlain, stackMate], 0, 0, 'output');
		expect(result).toContain(toStacked);
		expect(result).toContain(toPlain);
		expect(result).toContain(stackMate);
		expect(result).toHaveLength(3);
	});

	it('hovering one fanned-out destination input reveals its sibling destinations too, not just its own cable', () => {
		const toStacked = cable(0, 0, 1, 0, 1, 4);
		const toPlain = cable(0, 0, 3, 0, 1, 4);
		const stackMate = cable(1, 0, 2, 0, 0);
		const result = findJackNestCables([toStacked, toPlain, stackMate], 3, 0, 'input');
		expect(result).toContain(toStacked);
		expect(result).toContain(toPlain);
		expect(result).toContain(stackMate);
		expect(result).toHaveLength(3);
	});

	it('hovering an output with no connections returns an empty array', () => {
		expect(findJackNestCables([], 0, 0, 'output')).toEqual([]);
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

describe('computeUprateSet + autoRecolorCables', () => {
	function jacks(colours: string[]) {
		return colours.map((colour) => ({ name: '', colour, x: 0, y: 0 }));
	}
	function def(inputs: string[], outputs: string[]): ModuleDefinition {
		return { id: 0, short: '', long: '', height: 1, inputs: jacks(inputs), outputs: jacks(outputs) } as ModuleDefinition;
	}
	function run(cables: Cable[], defs: ModuleDefinition[]) {
		const modules = defs.map((d, index) => ({ index, def: d }));
		const uprated = computeUprateSet(cables, modules);
		return { uprated, recolored: autoRecolorCables(cables, uprated, new Map(modules.map((m) => [m.index, m.def]))) };
	}
	const RED = 0,
		BLUE = 1,
		YELLOW = 2,
		ORANGE = 3;

	it('a Dynamic-logic (orange) output on a non-uprated module gets a yellow cable and uprates nothing', () => {
		const { uprated, recolored } = run([cable(0, 0, 1, 0, 1)], [def([], ['orange']), def(['orange'], [])]);
		expect(uprated.size).toBe(0);
		expect(recolored[0].colour).toBe(YELLOW);
	});

	it('red into a static blue input does not uprate the module', () => {
		const { uprated } = run([cable(0, 0, 1, 0, 1)], [def([], ['red']), def(['blue'], ['purple'])]);
		expect(uprated.has(1)).toBe(false);
	});

	it('red into a purple input uprates: Dynamic outputs go red/orange, static outputs keep their colour', () => {
		const cables = [cable(0, 0, 1, 0, 1), cable(1, 0, 2, 0, 1), cable(1, 1, 2, 1, 1), cable(1, 2, 2, 2, 1), cable(1, 3, 2, 3, 1)];
		const { uprated, recolored } = run(cables, [
			def([], ['red']),
			def(['purple'], ['purple', 'orange', 'yellow', 'blue']),
			def(['blue', 'yellow', 'yellow', 'blue'], []),
		]);
		expect(uprated.has(1)).toBe(true);
		expect(recolored.slice(1).map((c) => c.colour)).toEqual([RED, ORANGE, YELLOW, BLUE]);
	});

	it('red reaching a purple input only through an input-to-input chain still uprates the module', () => {
		const cables = [cable(0, 0, 1, 0, 1), cable(1, 0, 2, 0, 0)];
		const { uprated } = run(cables, [def([], ['red']), def(['red'], []), def(['purple'], [])]);
		expect(uprated.has(2)).toBe(true);
	});
});
