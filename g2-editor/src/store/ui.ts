import type { Cable } from '@/renderer/cableRenderer';
import type { ClipboardEntry } from '@/types/patch';
import { SLOT_LABELS } from '@/constants';
import type { SlotAreaState } from '@/types/ui';
import type { SlotLabel } from '@/types';
import { defineStore } from 'pinia';
import { useDeviceStore } from './device';
import { useSettingsStore } from './settings';

function defaultSlotAreaState(): SlotAreaState {
	return { areaMode: 1, dividerPos: 50, lastNonSplitArea: 1 };
}

export const useUiStore = defineStore('ui', {
	state: () => ({
		slotInFocus: 'A' as SlotLabel,
		slotAreaStates: {
			A: defaultSlotAreaState(),
			B: defaultSlotAreaState(),
			C: defaultSlotAreaState(),
			D: defaultSlotAreaState(),
		} as Record<SlotLabel, SlotAreaState>,
		variation: 0 as number,
		moduleColor: 0 as number,
		selectedCables: [] as Cable[],
		selectedModules: [] as number[],
		selectedModulesArea: null as 'va' | 'fx' | null,
		selectedParam: null as { moduleId: number; paramIndex: number } | null,
		showSvgViewer: false as boolean,
		cableShakeCount: 0 as number,
		draggedModuleId: null as number | null,
		helpModuleTypeId: null as number | null,
		helpAllModules: false as boolean,
		clipboard: null as ClipboardEntry | null,
		lastMousePos: null as { col: number; row: number; area: 'va' | 'fx' } | null,
	}),

	getters: {
		selectedSlotIndex: (state) => SLOT_LABELS.indexOf(state.slotInFocus),

		// Current slot's area mode (0=FX, 1=Voice, 2=Split)
		area: (state): number => state.slotAreaStates[state.slotInFocus].areaMode,

		// Active single area for patch/USB operations: never returns 2.
		// In Split mode returns the last non-split area so the USB layer stays unaware of Split.
		activeArea: (state): 0 | 1 => {
			const s = state.slotAreaStates[state.slotInFocus];
			return s.areaMode === 2 ? s.lastNonSplitArea : (s.areaMode as 0 | 1);
		},

		dividerPos: (state): number => state.slotAreaStates[state.slotInFocus].dividerPos,
	},

	actions: {
		setSlotInFocus(slot: SlotLabel) {
			this.slotInFocus = slot;
			this.clearSelection();
			const device = useDeviceStore().device;
			if (device?.performance) device.performance.focus = slot;
		},

		setModuleColor(index: number) {
			this.moduleColor = index;
		},

		selectModules(indices: number[], area: 'va' | 'fx') {
			this.selectedModules = indices;
			this.selectedModulesArea = area;
		},

		toggleModuleSelection(index: number, area: 'va' | 'fx') {
			const i = this.selectedModules.indexOf(index);
			if (i >= 0) this.selectedModules.splice(i, 1);
			else this.selectedModules.push(index);
			this.selectedModulesArea = area;
		},

		clearSelection() {
			this.selectedModules = [];
			this.selectedModulesArea = null;
			this.selectedCables = [];
			this.selectedParam = null;
		},

		setSelectedParam(moduleId: number, paramIndex: number) {
			this.selectedParam = { moduleId, paramIndex };
		},

		clearSelectedParam() {
			this.selectedParam = null;
		},

		toggleSvgViewer() {
			this.showSvgViewer = !this.showSvgViewer;
		},

		showModuleHelp(typeId: number) {
			this.helpAllModules = false;
			if (this.helpModuleTypeId === typeId) {
				this.helpModuleTypeId = null;
				return;
			}
			this.helpModuleTypeId = typeId;
			const settings = useSettingsStore();
			if (!settings.showRightPane || settings.rightPaneTab !== 'modules') {
				settings.rightPaneTab = 'modules';
				settings.showRightPane = true;
			}
		},

		toggleAllModuleHelp() {
			this.helpModuleTypeId = null;
			this.helpAllModules = !this.helpAllModules;
			const settings = useSettingsStore();
			if (this.helpAllModules && (!settings.showRightPane || settings.rightPaneTab !== 'modules')) {
				settings.rightPaneTab = 'modules';
				settings.showRightPane = true;
			}
		},

		shakeCables() {
			this.cableShakeCount++;
		},

		setAreaMode(mode: 0 | 1 | 2) {
			const s = this.slotAreaStates[this.slotInFocus];
			if (mode !== 2) s.lastNonSplitArea = mode;
			s.areaMode = mode;
			this.clearSelection();
		},

		toggleSplit() {
			const s = this.slotAreaStates[this.slotInFocus];
			if (s.areaMode === 2) {
				s.areaMode = s.lastNonSplitArea;
			} else {
				s.lastNonSplitArea = s.areaMode as 0 | 1;
				s.areaMode = 2;
			}
			this.clearSelection();
		},

		setDividerPos(pos: number) {
			this.slotAreaStates[this.slotInFocus].dividerPos = Math.max(0, Math.min(100, pos));
		},
	},
});
