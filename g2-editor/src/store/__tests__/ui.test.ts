import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import { useSettingsStore } from '@/store/settings';
import { useDeviceStore } from '@/store/device';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined), runBatch: vi.fn().mockResolvedValue([]) } };
});

function seedPatch(height: number | undefined) {
	const slots = useSlotsStore();
	slots.slots['A'].patch = {
		description: height === undefined ? undefined : { variation: 0, height },
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [], cableList: [] },
		],
	} as any;
	return slots.slots['A'].patch as any;
}

describe('ui store — area getters', () => {
	it.each([
		[0, 0],
		[239, 2],
		[539, 2],
		[540, 1],
		[551, 1],
		[600, 1],
	])('height %i maps to area %i', (height, area) => {
		seedPatch(height);
		expect(useUiStore().area).toBe(area);
	});

	it('activeArea never returns 2 (split falls back to voice)', () => {
		seedPatch(239);
		expect(useUiStore().area).toBe(2);
		expect(useUiStore().activeArea).toBe(1);
		seedPatch(0);
		expect(useUiStore().activeArea).toBe(0);
	});

	it('defaults to voice (area 1) when no patch is loaded', () => {
		expect(useUiStore().area).toBe(1);
	});

	it('dividerPos is the clamped percentage of the voice height', () => {
		seedPatch(300);
		expect(useUiStore().dividerPos).toBe(50);
		seedPatch(0);
		expect(useUiStore().dividerPos).toBeCloseTo(0.2, 1); // clamped to a minimum of 1px
		seedPatch(5000);
		expect(useUiStore().dividerPos).toBeCloseTo(99.8, 1); // clamped to a maximum of 599px
	});

	it('selectedSlotIndex follows slotInFocus', () => {
		const ui = useUiStore();
		ui.slotInFocus = 'C';
		expect(ui.selectedSlotIndex).toBe(2);
	});
});

describe('ui store — selection', () => {
	it('setSlotInFocus switches slot, clears the selection and tells the device store', () => {
		const ui = useUiStore();
		const spy = vi.spyOn(useDeviceStore(), 'setPerformanceFocus').mockImplementation(() => {});
		ui.selectModules([1, 2], 'va');
		ui.setSelectedParam(1, 3);

		ui.setSlotInFocus('B');

		expect(ui.slotInFocus).toBe('B');
		expect(ui.selectedModules).toEqual([]);
		expect(ui.selectedModulesArea).toBeNull();
		expect(ui.selectedParam).toBeNull();
		expect(spy).toHaveBeenCalledWith('B');
	});

	it('toggleModuleSelection adds, removes and records the area', () => {
		const ui = useUiStore();
		ui.toggleModuleSelection(4, 'fx');
		ui.toggleModuleSelection(5, 'fx');
		expect(ui.selectedModules).toEqual([4, 5]);
		ui.toggleModuleSelection(4, 'fx');
		expect(ui.selectedModules).toEqual([5]);
		expect(ui.selectedModulesArea).toBe('fx');
	});

	it('clearSelection resets modules, cables and param', () => {
		const ui = useUiStore();
		ui.selectModules([1], 'va');
		ui.selectedCables = [{ smod: 1 } as any];
		ui.setSelectedParam(1, 1);
		ui.clearSelection();
		expect(ui.selectedModules).toEqual([]);
		expect(ui.selectedCables).toEqual([]);
		expect(ui.selectedParam).toBeNull();
	});

	it('setSelectedParam / clearSelectedParam', () => {
		const ui = useUiStore();
		ui.setSelectedParam(7, 2);
		expect(ui.selectedParam).toEqual({ moduleId: 7, paramIndex: 2 });
		ui.clearSelectedParam();
		expect(ui.selectedParam).toBeNull();
	});
});

describe('ui store — clamped setters', () => {
	it('clamps morph group (0-7), banks (0-2) and pages (0-4)', () => {
		const ui = useUiStore();
		ui.setSelectedMorphGroup(99);
		expect(ui.selectedMorphGroup).toBe(7);
		ui.setSelectedMorphGroup(-3);
		expect(ui.selectedMorphGroup).toBe(0);
		ui.setSelectedParamBank(5);
		expect(ui.selectedParamBank).toBe(2);
		ui.setSelectedGlobalParamBank(-1);
		expect(ui.selectedGlobalParamBank).toBe(0);
		ui.setDisplayedParamPage(9);
		expect(ui.displayedParamPage).toBe(4);
		ui.setDisplayedGlobalParamPage(-2);
		expect(ui.displayedGlobalParamPage).toBe(0);
	});
});

describe('ui store — help and misc', () => {
	it('showModuleHelp toggles the same module off and opens the Modules pane', () => {
		const ui = useUiStore();
		const settings = useSettingsStore();
		settings.showRightPane = false;
		ui.showModuleHelp(12);
		expect(ui.helpModuleTypeId).toBe(12);
		expect(settings.showRightPane).toBe(true);
		expect(settings.rightPaneTab).toBe('modules');
		ui.showModuleHelp(12);
		expect(ui.helpModuleTypeId).toBeNull();
	});

	it('toggleAllModuleHelp clears the single-module help and flips the flag', () => {
		const ui = useUiStore();
		ui.showModuleHelp(3);
		ui.toggleAllModuleHelp();
		expect(ui.helpModuleTypeId).toBeNull();
		expect(ui.helpAllModules).toBe(true);
		ui.toggleAllModuleHelp();
		expect(ui.helpAllModules).toBe(false);
	});

	it('shakeCables bumps the counter', () => {
		const ui = useUiStore();
		ui.shakeCables();
		ui.shakeCables();
		expect(ui.cableShakeCount).toBe(2);
	});

	it('toggleSvgViewer flips the flag', () => {
		const ui = useUiStore();
		ui.toggleSvgViewer();
		expect(ui.showSvgViewer).toBe(true);
	});
});

describe('ui store — area mode', () => {
	it('setAreaFbar clamps to 0-16383, writes the description height and clears the selection', () => {
		const patch = seedPatch(600);
		const ui = useUiStore();
		ui.selectModules([1], 'va');
		ui.setAreaFbar(99999);
		expect(patch.description.height).toBe(16383);
		ui.setAreaFbar(-5);
		expect(patch.description.height).toBe(0);
		expect(ui.selectedModules).toEqual([]);
	});

	it('setAreaMode switches FX / Voice / Split and remembers the split height', () => {
		const patch = seedPatch(239);
		const ui = useUiStore();
		ui.setAreaMode(1);
		expect(patch.description.height).toBe(600);
		expect(patch.splitHeight).toBe(239);
		ui.setAreaMode(0);
		expect(patch.description.height).toBe(0);
		ui.setAreaMode(2);
		expect(patch.description.height).toBe(239);
	});

	it('toggleSplit enters split from voice and leaves it toward the nearer side', () => {
		const patch = seedPatch(600);
		const ui = useUiStore();
		ui.toggleSplit();
		expect(ui.area).toBe(2);
		ui.toggleSplit(); // split height 300 -> divider 50% -> voice
		expect(patch.description.height).toBe(600);
	});

	it('setDividerPos converts a percentage to a clamped height', () => {
		const patch = seedPatch(300);
		useUiStore().setDividerPos(50);
		expect(patch.description.height).toBe(300);
		useUiStore().setDividerPos(100);
		expect(patch.description.height).toBe(599);
		useUiStore().setDividerPos(0);
		expect(patch.description.height).toBe(1);
	});
});
