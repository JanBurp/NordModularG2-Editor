import { beforeEach, describe, expect, it, vi } from 'vitest';

// Module type -> definition, just enough of each to exercise computeGhostSuggestion's jack-pair
// ranking: colour-family matching plus jack-position distance.
vi.mock('@/renderer/nmg2mods', () => {
	const defs: Record<number, any> = {
		// Single blue output. Blue's uprated family is 'red' (getEffectiveJackColor), so it should
		// match a red input even though it displays as blue right now.
		10: { outputs: [{ name: 'Out0', colour: 'blue', x: 0, y: 0 }] },
		// Two red outputs at different positions, for the same-family tie-break-by-distance case.
		11: {
			outputs: [
				{ name: 'Out0', colour: 'red', x: 0, y: 0 },
				{ name: 'Out1', colour: 'red', x: 50, y: 50 },
			],
		},
		// A close but mismatched (yellow) input, and a far but family-matching (red) input.
		20: {
			inputs: [
				{ name: 'In0', colour: 'yellow', x: 1, y: 0 },
				{ name: 'In1', colour: 'red', x: 100, y: 100 },
			],
		},
		// Single red input, close to Out0 of module 11 and far from Out1.
		21: { inputs: [{ name: 'In0', colour: 'red', x: 5, y: 5 }] },
	};
	return { getModule: (type: number) => defs[type] };
});

import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import { useGhostCable } from '../useGhostCable';

function moduleStub(index: number, type: number, horiz = 0, vert = 0) {
	return { index, type, horiz, vert, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] };
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

describe('useGhostCable — computeGhostSuggestion ranking', () => {
	it('prefers a colour-family match over a closer but mismatched jack', () => {
		const uiStore = useUiStore();
		seed([moduleStub(1, 10), moduleStub(2, 20)]);
		uiStore.selectedModules = [1];
		uiStore.selectedModulesArea = 'va';

		const { computeGhostSuggestion } = useGhostCable();
		computeGhostSuggestion(2, 0, 0, 'va');

		expect(uiStore.ghostCable).toEqual({
			area: 1,
			from: { moduleIndex: 1, connectorIndex: 0, type: 'output', colour: 'blue' },
			to: { moduleIndex: 2, connectorIndex: 1, type: 'input', colour: 'red' }, // In1, not the closer In0
		});
	});

	it('breaks ties within a matched colour family by picking the closest jack', () => {
		const uiStore = useUiStore();
		seed([moduleStub(1, 11), moduleStub(2, 21)]);
		uiStore.selectedModules = [1];
		uiStore.selectedModulesArea = 'va';

		const { computeGhostSuggestion } = useGhostCable();
		computeGhostSuggestion(2, 0, 0, 'va');

		expect(uiStore.ghostCable?.from).toEqual({ moduleIndex: 1, connectorIndex: 0, type: 'output', colour: 'red' }); // Out0, closer than Out1
	});
});

describe('useGhostCable — cycleGhostCable', () => {
	it('advances through ranked candidates and wraps back to the first after the last', () => {
		const uiStore = useUiStore();
		seed([moduleStub(1, 11), moduleStub(2, 20)]);
		uiStore.selectedModules = [1];
		uiStore.selectedModulesArea = 'va';

		const { computeGhostSuggestion, cycleGhostCable } = useGhostCable();
		computeGhostSuggestion(2, 0, 0, 'va');

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
