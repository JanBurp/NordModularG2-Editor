import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Real module type 5 (used by moduleStub) has no params — stub a 2-param module def (real param type, so changeParamValue resolves it) so
// navigateParam's Left/Right cycling has something to cycle through.
vi.mock('@/renderer/nmg2mods', () => ({
	getModule: () => ({ params: [{ type: 'Bipolar_127', def: 50 }, { type: 'Bipolar_127' }] }),
	getParamNavOrder: () => [0, 1],
	getParamDefault: (p: { def?: number }) => p.def ?? 0,
}));

import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import { useSettingsStore } from '@/store/settings';
import { DeviceStatus, useDeviceStore } from '@/store/device';
import { useParamEditDialog } from '../useParamEditDialog';
import { useModuleKeyboard } from '../useModuleKeyboard';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).document.activeElement = null;
	// useModuleKeyboard() is called directly here, outside any component's setup() — there's no
	// jsdom/@vue/test-utils in this project (see the vi.hoisted() comment above), so its
	// onMounted/onUnmounted window-listener wiring isn't exercised; these tests call
	// handleKeydown directly instead. Vue warns about the missing instance; expected here.
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// isGrabModifierPressed() is Cmd-on-Mac / Ctrl-elsewhere; setting both makes the event
// grab-modifier-true regardless of the `isMac` stub above.
function grabKey(key: string): KeyboardEvent {
	return { key, ctrlKey: true, metaKey: true, shiftKey: false, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

function arrowKey(key: string, shiftKey = false): KeyboardEvent {
	return { key, ctrlKey: false, metaKey: false, shiftKey, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

function moduleStub(index: number, horiz = 0, vert = 0) {
	return { index, type: 5, horiz, vert, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] };
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
	it('Alt/Option+3 selects Morph Group 3 (index 2), matched on e.code', () => {
		const uiStore = useUiStore();
		const { handleKeydown } = useModuleKeyboard();

		// macOS Option+3 yields key '£'
		handleKeydown({
			key: '£',
			code: 'Digit3',
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			altKey: true,
			preventDefault: vi.fn(),
		} as unknown as KeyboardEvent);

		expect(uiStore.selectedMorphGroup).toBe(2);
	});

	it('Ctrl/Cmd+3 does not select a Morph Group (Cmd+1 is Dump One)', () => {
		const uiStore = useUiStore();
		const before = uiStore.selectedMorphGroup;
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown({ ...grabKey('3'), code: 'Digit3' } as KeyboardEvent);

		expect(uiStore.selectedMorphGroup).toBe(before);
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

// Column 0 (horiz=0) has two modules stacked; column 1 (horiz=1) has one module —
// confirms Up/Down sweeps into the next/previous column at a column boundary, matching
// real G2 panel cursor nav (verified on hardware: Down at the bottom of a column moves
// to the top of the next column, and vice versa for Up, until the grid's own corners).
function seedColumn() {
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	slotsStore.slots['A'].patch = {
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [moduleStub(1, 0, 0), moduleStub(2, 0, 10), moduleStub(3, 1, 0)], cableList: [] },
		],
	} as any;
	slotsStore.slots['A'].variations = [
		{ fx: {}, voice: {}, patch: { morphDials: Array(8).fill(0), morphModes: Array(8).fill(0), morphAssignments: [] } },
	] as any;
	return { uiStore, slotsStore };
}

// Two modules per column, each column's top module sitting far from the other column's —
// distinguishes "always land on the target column's top module" from the old
// closest-by-vert heuristic (verified on hardware: Left/Right always lands on top).
function seedTwoColumns() {
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	slotsStore.slots['A'].patch = {
		areas: [
			{ modules: [], cableList: [] },
			{
				modules: [moduleStub(1, 0, 0), moduleStub(2, 0, 20), moduleStub(3, 1, 5), moduleStub(4, 1, 25)],
				cableList: [],
			},
		],
	} as any;
	slotsStore.slots['A'].variations = [
		{ fx: {}, voice: {}, patch: { morphDials: Array(8).fill(0), morphModes: Array(8).fill(0), morphAssignments: [] } },
	] as any;
	return { uiStore, slotsStore };
}

describe('useModuleKeyboard — Shift+Arrow module navigation wrap', () => {
	it('ArrowDown at the bottom of a column moves to the top of the next column', () => {
		const { uiStore } = seedColumn();
		uiStore.selectModules([2], 'va'); // bottom of column 0
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowDown', true));

		expect(uiStore.selectedModules).toEqual([3]); // top of column 1
	});

	it('ArrowUp at the top of a column moves to the bottom of the previous column', () => {
		const { uiStore } = seedColumn();
		uiStore.selectModules([3], 'va'); // column 1's only module
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowUp', true));

		expect(uiStore.selectedModules).toEqual([2]); // bottom of column 0
	});

	it('ArrowUp at the top-left module wraps to the bottom of the last column', () => {
		const { uiStore } = seedColumn();
		uiStore.selectModules([1], 'va'); // top-left of the whole grid
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowUp', true));

		expect(uiStore.selectedModules).toEqual([3]); // bottom of the last column
	});

	it('ArrowRight always lands on the top of the next column, not the closest-by-vert module', () => {
		const { uiStore } = seedTwoColumns();
		uiStore.selectModules([2], 'va'); // column 0, vert 20 — closest-by-vert would pick module 4 (vert 25)
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowRight', true));

		expect(uiStore.selectedModules).toEqual([3]); // top of column 1 (vert 5)
	});

	it('ArrowLeft always lands on the top of the previous column, not the closest-by-vert module', () => {
		const { uiStore } = seedTwoColumns();
		uiStore.selectModules([4], 'va'); // column 1, vert 25 — closest-by-vert would pick module 2 (vert 20)
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowLeft', true));

		expect(uiStore.selectedModules).toEqual([1]); // top of column 0 (vert 0)
	});
});

describe('useModuleKeyboard — hardware cursor sync (select-param)', () => {
	it('Shift+Arrow module nav sends select-param when connected', () => {
		const { uiStore } = seedColumn();
		useDeviceStore().status = DeviceStatus.Connected;
		const run = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.cli.run = run;
		uiStore.selectModules([1], 'va');
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowDown', true));

		expect(run).toHaveBeenCalledWith(['select-param', 'A', 'va', '2', '0']);
	});

	it('plain Left/Right param nav sends select-param when connected', () => {
		const { uiStore } = seedColumn();
		useDeviceStore().status = DeviceStatus.Connected;
		const run = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.cli.run = run;
		uiStore.selectModules([1], 'va');
		uiStore.setSelectedParam(1, 0);
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowRight', false));

		expect(run).toHaveBeenCalledWith(['select-param', 'A', 'va', '1', '1']);
	});

	it('does not send select-param when the device is disconnected', () => {
		const { uiStore } = seedColumn();
		useDeviceStore().status = DeviceStatus.Disconnected;
		const run = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.cli.run = run;
		uiStore.selectModules([1], 'va');
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('ArrowDown', true));

		expect(run).not.toHaveBeenCalled();
	});
});

describe('useModuleKeyboard — arrow keys follow hover (settings.hoverKeyTarget)', () => {
	// Same module index 1 in both areas: the hovered FX param must not resolve to the VA module.
	function seedHover(hoverKeyTarget: boolean) {
		const { uiStore, slotsStore } = seedSelectedParam();
		slotsStore.slots['A'].patch!.areas[0].modules = [moduleStub(1)];
		useSettingsStore().setHoverKeyTarget(hoverKeyTarget);
		uiStore.setHoveredParam(1, 1, 'fx');
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		return { uiStore, setParam };
	}

	it('ArrowUp changes the hovered param, not the selected one', () => {
		const { uiStore, setParam } = seedHover(true);
		useModuleKeyboard().handleKeydown(arrowKey('ArrowUp'));
		expect(setParam).toHaveBeenCalledWith(1, 1, expect.any(Number), 0, 'fx');
		expect(uiStore.selectedParam).toEqual({ moduleId: 1, paramIndex: 0 });
	});

	it('works without any selected module', () => {
		const { uiStore, setParam } = seedHover(true);
		uiStore.clearSelection();
		useModuleKeyboard().handleKeydown(arrowKey('ArrowDown'));
		expect(setParam).toHaveBeenCalledWith(1, 1, expect.any(Number), 0, 'fx');
	});

	it('ignores the hover when the setting is off', () => {
		const { setParam } = seedHover(false);
		useModuleKeyboard().handleKeydown(arrowKey('ArrowUp'));
		expect(setParam).toHaveBeenCalledWith(1, 0, expect.any(Number), 0, 'voice');
	});

	it('Left/Right still navigates the selection', () => {
		const { uiStore } = seedHover(true);
		useModuleKeyboard().handleKeydown(arrowKey('ArrowRight'));
		expect(uiStore.selectedParam).toEqual({ moduleId: 1, paramIndex: 1 });
		expect(uiStore.hoveredParam).toEqual({ moduleId: 1, paramIndex: 1, area: 'fx' });
	});
});

describe('useModuleKeyboard — = opens Set Value, Enter resets to default', () => {
	afterEach(() => {
		useParamEditDialog().closeParamEdit(); // reset shared singleton state for other tests
	});

	it('= opens the Set Value popup for the selected param', () => {
		seedSelectedParam();
		const { handleKeydown } = useModuleKeyboard();
		const e = arrowKey('=');

		handleKeydown(e);

		expect(useParamEditDialog().showDialog.value).toBe(true);
		expect(e.preventDefault).toHaveBeenCalled();
	});

	it('Shift+= (e.g. Shift+0 on a Dutch/German layout) also opens it', () => {
		seedSelectedParam();
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('=', true));

		expect(useParamEditDialog().showDialog.value).toBe(true);
	});

	it('Enter sets the selected param to its default', () => {
		const { slotsStore } = seedSelectedParam();
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('Enter'));

		expect(setParam).toHaveBeenCalledWith(1, 0, 50, 0, 'voice');
	});

	it('Enter leaves the param alone while a jack is armed (App.vue confirms the cable)', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.armedJack = { moduleIndex: 2, connectorIndex: 0, type: 'output', colour: 'red' };
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown } = useModuleKeyboard();
		const e = arrowKey('Enter');

		handleKeydown(e);

		expect(setParam).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it('Enter from a popup input that already unmounted (focus back on <body>) does not reset the param', () => {
		const { slotsStore } = seedSelectedParam();
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown({ ...arrowKey('Enter'), target: new (globalThis as any).HTMLInputElement() } as KeyboardEvent);

		expect(setParam).not.toHaveBeenCalled();
	});

	it('Enter leaves a selected param alone once its module was deselected', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		uiStore.toggleModuleSelection(1, 'va'); // Shift-click title: deselects, keeps selectedParam
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('Enter'));

		expect(setParam).not.toHaveBeenCalled();
	});

	// Fake pointerdown target: `closest` answers for the given selectors only
	const pointerOn = (...inside: string[]) => ({ target: { closest: (sel: string) => (inside.includes(sel) ? {} : null) } }) as unknown as PointerEvent;

	it('= and Enter leave the param alone after a click outside the canvas (e.g. Patch Browser)', () => {
		const { slotsStore } = seedSelectedParam();
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown, handlePointerDown } = useModuleKeyboard();
		handlePointerDown(pointerOn());
		const e = arrowKey('Enter');

		handleKeydown(e);
		handleKeydown(arrowKey('='));

		expect(setParam).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
		expect(useParamEditDialog().showDialog.value).toBe(false);
	});

	it('Enter works again after a click back on the canvas', () => {
		const { slotsStore } = seedSelectedParam();
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown, handlePointerDown } = useModuleKeyboard();
		handlePointerDown(pointerOn());
		handlePointerDown(pointerOn('[data-testid^="canvas-"]'));

		handleKeydown(arrowKey('Enter'));

		expect(setParam).toHaveBeenCalledWith(1, 0, 50, 0, 'voice');
	});

	it('a click inside a popup (context menu, Set Value) keeps the canvas as key target', () => {
		const { slotsStore } = seedSelectedParam();
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown, handlePointerDown } = useModuleKeyboard();
		handlePointerDown(pointerOn('[data-testid^="canvas-"]'));
		handlePointerDown(pointerOn('[role=dialog], [role=menu]'));

		handleKeydown(arrowKey('Enter'));

		expect(setParam).toHaveBeenCalled();
	});

	it('Enter on a hovered param (Focus on hover) works even after a click elsewhere', () => {
		const { uiStore, slotsStore } = seedSelectedParam();
		useSettingsStore().setHoverKeyTarget(true);
		uiStore.setHoveredParam(1, 0, 'va');
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown, handlePointerDown } = useModuleKeyboard();
		handlePointerDown(pointerOn());

		handleKeydown(arrowKey('Enter'));

		expect(setParam).toHaveBeenCalledWith(1, 0, 50, 0, 'voice');
	});

	it('= and Enter do nothing without a target param', () => {
		const slotsStore = useSlotsStore();
		const setParam = vi.spyOn(slotsStore, 'setParam').mockResolvedValue(undefined as any);
		const { handleKeydown } = useModuleKeyboard();

		handleKeydown(arrowKey('='));
		handleKeydown(arrowKey('Enter'));

		expect(useParamEditDialog().showDialog.value).toBe(false);
		expect(setParam).not.toHaveBeenCalled();
	});
});
