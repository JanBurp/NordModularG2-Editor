import { beforeEach, describe, expect, it, vi } from 'vitest';

// useModuleKeyboard.ts transitively imports utils/platform.ts, which reads `window`/`navigator`
// at module-eval time — before any beforeEach runs. vi.hoisted() runs above the static imports
// below, so these globals exist by the time that module loads. There's no jsdom in this project
// (vitest.config.ts uses environment: 'node'), so DOM classes are stubbed minimally here too.
vi.hoisted(() => {
	class FakeInputElement {}
	(globalThis as any).HTMLInputElement = FakeInputElement;
	(globalThis as any).HTMLTextAreaElement = class {};
	(globalThis as any).HTMLSelectElement = class {};
	(globalThis as any).document = { activeElement: null as unknown, createElement: () => ({}) };
	(globalThis as any).window = { electronAPI: { isMac: false }, cli: { run: () => Promise.resolve(undefined) } };
});

import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import { useParamEditDialog } from '../useParamEditDialog';
import { useModuleKeyboard } from '../useModuleKeyboard';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).document.activeElement = null;
});

// isGrabModifierPressed() is Cmd-on-Mac / Ctrl-elsewhere; setting both makes the event
// grab-modifier-true regardless of the `isMac` stub above.
function grabKey(key: string): KeyboardEvent {
	return { key, ctrlKey: true, metaKey: true, shiftKey: false, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

function moduleStub(index: number) {
	return { index, type: 5, horiz: 0, vert: 0, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] };
}

// Seeds a slot with one module in the Voice area, a selected param on it, and an empty
// morphAssignments array for the current variation — the minimal state toggleMorphAssign()/
// nudgeMorphRange() need.
function seedSelectedParam() {
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	slotsStore.slots['A'].patch = {
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [moduleStub(1)], cableList: [] },
		],
	} as any;
	slotsStore.slots['A'].variations = [
		{ fx: {}, voice: {}, patch: { morphDials: Array(8).fill(0), morphModes: Array(8).fill(0), morphAssignments: [] } },
	] as any;
	uiStore.selectModules([1], 'va');
	uiStore.setSelectedParam(1, 0);
	return { uiStore, slotsStore };
}

describe('useModuleKeyboard — keyboard Morph Group select/assign', () => {
	it('Ctrl/Cmd+3 selects Morph Group 3 (index 2)', () => {
		const uiStore = useUiStore();
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(grabKey('3'));

		expect(uiStore.selectedMorphGroup).toBe(2);
	});

	it('Ctrl/Cmd+Enter assigns the selected param to the active group at range 127', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.setSelectedMorphGroup(0);
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(grabKey('Enter'));

		expect(slotsStore.getMorphAssignments('A', 0)).toEqual([{ groupIndex: 0, location: 1, moduleIndex: 1, paramIndex: 0, range: 127 }]);
	});

	it('Ctrl/Cmd+Enter deassigns an already-assigned param', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.setSelectedMorphGroup(0);
		const { handleKeydown } = useModuleKeyboard();
		handleKeydown(grabKey('Enter')); // assign
		expect(slotsStore.getMorphAssignments('A', 0)).toHaveLength(1);

		handleKeydown(grabKey('Enter')); // toggle off

		expect(slotsStore.getMorphAssignments('A', 0)).toHaveLength(0);
	});

	it('Ctrl/Cmd+Enter with no selected param is a no-op', () => {
		const uiStore = useUiStore();
		const slotsStore = useSlotsStore();
		slotsStore.slots['A'].patch = {
			areas: [
				{ modules: [], cableList: [] },
				{ modules: [], cableList: [] },
			],
		} as any;
		slotsStore.slots['A'].variations = [
			{ fx: {}, voice: {}, patch: { morphDials: Array(8).fill(0), morphModes: Array(8).fill(0), morphAssignments: [] } },
		] as any;
		expect(uiStore.selectedParam).toBeNull();
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(grabKey('Enter'));

		expect(slotsStore.getMorphAssignments('A', 0)).toHaveLength(0);
	});

	it('composes with the existing Ctrl/Cmd+Up/Down range nudge after a keyboard-toggled assignment', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.setSelectedMorphGroup(0);
		const { handleKeydown } = useModuleKeyboard();
		handleKeydown(grabKey('Enter')); // assign at range 127

		handleKeydown(grabKey('ArrowDown')); // nudge -1

		expect(slotsStore.getMorphAssignments('A', 0)[0].range).toBe(126);
	});

	it('is blocked while a dialog is open', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.setSelectedMorphGroup(0);
		const { showDialog } = useParamEditDialog();
		showDialog.value = true;
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(grabKey('Enter'));

		expect(slotsStore.getMorphAssignments('A', 0)).toHaveLength(0);
		showDialog.value = false; // reset shared singleton state for other tests
	});

	it('is blocked while a text input is focused', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.setSelectedMorphGroup(0);
		(globalThis as any).document.activeElement = new (globalThis as any).HTMLInputElement();
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(grabKey('Enter'));

		expect(slotsStore.getMorphAssignments('A', 0)).toHaveLength(0);
	});
});
