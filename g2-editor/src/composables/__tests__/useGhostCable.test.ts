import { beforeEach, describe, expect, it, vi } from 'vitest';

// Module type -> definition, just enough of each to exercise computeGhostSuggestion: audio-rate
// right-third jack filtering, top/bottom ordering and stereo L/R pairing.
vi.mock('@/renderer/nmg2mods', () => {
	const defs: Record<number, any> = {
		// Purple output (uprate-able to red) bottom-right, plus ineligible: yellow, red but left third,
		// and a static blue (never uprated) that is bottommost.
		10: {
			outputs: [
				{ name: 'Gate', colour: 'yellow', x: 240, y: 40 },
				{ name: 'Left', colour: 'red', x: 20, y: 40 },
				{ name: 'Out', colour: 'purple', x: 240, y: 20 },
				{ name: 'Ctl', colour: 'blue', x: 240, y: 50 },
			],
		},
		// Two eligible outputs: top-right and bottom-right.
		11: {
			outputs: [
				{ name: 'Top', colour: 'red', x: 240, y: 10 },
				{ name: 'Bottom', colour: 'red', x: 240, y: 40 },
			],
		},
		// Eligible inputs at different heights (bottom listed first), plus an ineligible left one.
		20: {
			inputs: [
				{ name: 'Low', colour: 'red', x: 200, y: 40 },
				{ name: 'Left', colour: 'red', x: 10, y: 5 },
				{ name: 'High', colour: 'purple', x: 200, y: 10 },
			],
		},
		// Only ineligible inputs.
		21: {
			inputs: [
				{ name: 'Left', colour: 'red', x: 10, y: 5 },
				{ name: 'Ctl', colour: 'yellow', x: 240, y: 5 },
			],
		},
		// Stereo output / stereo input / mono output / mono input.
		30: {
			outputs: [
				{ name: 'OutL', colour: 'red', x: 220, y: 20 },
				{ name: 'OutR', colour: 'red', x: 246, y: 20 },
			],
		},
		31: {
			inputs: [
				{ name: 'InL', colour: 'red', x: 220, y: 18 },
				{ name: 'InR', colour: 'red', x: 246, y: 18 },
			],
		},
		32: { outputs: [{ name: 'Out', colour: 'red', x: 246, y: 20 }] },
		33: { inputs: [{ name: 'In', colour: 'red', x: 246, y: 18 }] },
	};
	return { getModule: (type: number) => defs[type] };
});

import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import { useGhostCable } from '../useGhostCable';

function moduleStub(index: number, type: number, horiz = 0, vert = 0) {
	return { index, type, horiz, vert, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
}

function seed(modules: ReturnType<typeof moduleStub>[]) {
	const slotsStore = useSlotsStore();
	slotsStore.slots['A'].patch = {
		areas: [
			{ modules: [], cableList: [] },
			{ modules, cableList: [] },
		],
	} as any;
}

beforeEach(() => {
	setActivePinia(createPinia());
});

// Source module at (0,0) directly above the new module at (0,2) (mock defs have no height -> default 2).
function suggest(srcType: number, dstType: number) {
	seed([moduleStub(1, srcType, 0, 0), moduleStub(2, dstType, 0, 2)]);
	useGhostCable().computeGhostSuggestion(2, 0, 2, 'va');
	return useUiStore().ghostCable;
}

const jack = (moduleIndex: number, connectorIndex: number, type: 'input' | 'output', colour = 'red') => ({ moduleIndex, connectorIndex, type, colour });

describe('useGhostCable — computeGhostSuggestion audio jacks', () => {
	it('only considers audio-rate (red/purple) jacks in the right third', () => {
		const ghost = suggest(10, 20);
		expect(ghost?.from).toEqual(jack(1, 2, 'output', 'blue')); // not yellow Gate / left-third Left / static blue Ctl
		expect(ghost?.to).toEqual(jack(2, 2, 'input', 'blue')); // not left-third Left
		expect(useUiStore().ghostCandidates.length).toBe(2); // 1 output x 2 inputs
	});

	it('resolves Dynamic (purple) jacks to their effective colour, never cable colour purple', async () => {
		seed([{ ...moduleStub(1, 10, 0, 0), uprate: 1 }, moduleStub(2, 20, 0, 2)]);
		useGhostCable().computeGhostSuggestion(2, 0, 2, 'va');
		expect(useUiStore().ghostCable?.from.colour).toBe('red');
		const spy = vi.spyOn(useSlotsStore(), 'addCable').mockResolvedValue(undefined as any);
		await useGhostCable().confirmGhostCable();
		expect(spy.mock.calls[0][7]).toBe(0); // red, not 5 (purple)
	});

	it('prefers the topmost input and the bottommost output', () => {
		const ghost = suggest(11, 20);
		expect(ghost?.from).toMatchObject({ connectorIndex: 1 }); // Bottom
		expect(ghost?.to).toMatchObject({ connectorIndex: 2 }); // High
	});

	it('suggests nothing when a module has no eligible jack', () => {
		expect(suggest(11, 21)).toBeNull();
	});

	it('uses the nearest module above in the same column, across a gap', () => {
		seed([moduleStub(1, 10, 0, 0), moduleStub(3, 11, 0, 3), moduleStub(2, 20, 0, 8)]);
		useGhostCable().computeGhostSuggestion(2, 0, 8, 'va');
		expect(useUiStore().ghostCable?.from.moduleIndex).toBe(3);
	});

	it('only uses the module above as source, not a selected one elsewhere', () => {
		const uiStore = useUiStore();
		seed([moduleStub(1, 11, 1, 0), moduleStub(2, 20, 0, 2)]);
		uiStore.selectedModules = [1];
		uiStore.selectedModulesArea = 'va';
		useGhostCable().computeGhostSuggestion(2, 0, 2, 'va');
		expect(uiStore.ghostCable).toBeNull();
	});
});

describe('useGhostCable — stereo', () => {
	it('connects L->L and R->R for stereo output to stereo input', () => {
		const ghost = suggest(30, 31);
		expect(ghost?.from).toEqual(jack(1, 0, 'output'));
		expect(ghost?.to).toEqual(jack(2, 0, 'input'));
		expect(ghost?.extra).toEqual({ from: jack(1, 1, 'output'), to: jack(2, 1, 'input') });
	});

	it('feeds both inputs from a mono output', () => {
		const ghost = suggest(32, 31);
		expect(ghost?.from).toEqual(jack(1, 0, 'output'));
		expect(ghost?.extra).toEqual({ from: jack(1, 0, 'output'), to: jack(2, 1, 'input') });
	});

	it('uses only the left output for a mono input', () => {
		const ghost = suggest(30, 33);
		expect(ghost?.from).toEqual(jack(1, 0, 'output'));
		expect(ghost?.extra).toBeUndefined();
	});

	it('confirmGhostCable connects both cables of a stereo suggestion', async () => {
		suggest(30, 31);
		const slotsStore = useSlotsStore();
		const spy = vi.spyOn(slotsStore, 'addCable').mockResolvedValue(undefined as any);
		await useGhostCable().confirmGhostCable();
		expect(spy).toHaveBeenCalledTimes(2);
	});
});

describe('useGhostCable — suggestAfterDelete', () => {
	const cable = (smod: number, scon: number, dmod: number, dcon: number) => ({ colour: 0, smod, scon, dmod, dcon, dir: 1 });

	// Deleted module 2 (type 32/33 jacks irrelevant, only its cables count) sat between 1 above and 3 below.
	function afterDelete(srcType: number, dstType: number, cablesBefore: any[], belowVert = 4) {
		seed([moduleStub(1, srcType, 0, 0), moduleStub(3, dstType, 0, belowVert)]);
		useGhostCable().suggestAfterDelete(moduleStub(2, 33, 0, 2), cablesBefore, 'va');
		return useUiStore().ghostCable;
	}

	it('bridges the modules above and below the deleted one', () => {
		const ghost = afterDelete(32, 33, [cable(1, 0, 2, 0), cable(2, 0, 3, 0)]);
		expect(ghost?.from).toEqual(jack(1, 0, 'output'));
		expect(ghost?.to).toEqual(jack(3, 0, 'input'));
	});

	it('allows a gap between the deleted module and the one below', () => {
		expect(afterDelete(32, 33, [cable(1, 0, 2, 0), cable(2, 0, 3, 0)], 7)).not.toBeNull();
	});

	it('suggests nothing when one side was not cabled to the deleted module', () => {
		expect(afterDelete(32, 33, [cable(1, 0, 2, 0)])).toBeNull();
		expect(afterDelete(32, 33, [cable(2, 0, 3, 0)])).toBeNull();
	});

	it('suggests nothing when the cable from above is not on an audio jack', () => {
		expect(afterDelete(10, 33, [cable(1, 0, 2, 0), cable(2, 0, 3, 0)])).toBeNull(); // output 0 = yellow Gate
	});

	it('bridges stereo L->L / R->R', () => {
		const ghost = afterDelete(30, 31, [cable(1, 0, 2, 0), cable(2, 0, 3, 0)]);
		expect(ghost?.from).toEqual(jack(1, 0, 'output'));
		expect(ghost?.to).toEqual(jack(3, 0, 'input'));
		expect(ghost?.extra).toEqual({ from: jack(1, 1, 'output'), to: jack(3, 1, 'input') });
	});
});

describe('useGhostCable — cycleGhostCable', () => {
	it('advances through ranked candidates and wraps back to the first after the last', () => {
		const uiStore = useUiStore();
		seed([moduleStub(1, 11, 0, 0), moduleStub(2, 20, 0, 2)]);

		const { computeGhostSuggestion, cycleGhostCable } = useGhostCable();
		computeGhostSuggestion(2, 0, 2, 'va');

		expect(uiStore.ghostCandidates.length).toBe(4); // 2 outputs x 2 free inputs
		const first = uiStore.ghostCable;

		const seen = [first];
		for (let i = 0; i < 3; i++) {
			cycleGhostCable();
			seen.push(uiStore.ghostCable);
		}
		// 4 distinct candidates, no repeats until wraparound.
		expect(new Set(seen.map((g) => JSON.stringify(g))).size).toBe(4);

		cycleGhostCable(); // 5th cycle wraps back to the first (best) candidate
		expect(uiStore.ghostCable).toEqual(first);
	});

	it('is a no-op when there is no suggestion to cycle', () => {
		const uiStore = useUiStore();
		const { cycleGhostCable } = useGhostCable();
		cycleGhostCable();
		expect(uiStore.ghostCable).toBeNull();
	});
});
