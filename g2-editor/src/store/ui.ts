import type { Cable } from '@/renderer/cableRenderer';
import { SLOT_LABELS } from '@/constants';
import type { SlotLabel } from '@/types';
import { defineStore } from 'pinia';

export type PaneTab = 'modules' | 'info' | 'browser' | 'settings' | '';

export const useUiStore = defineStore('ui', {
	state: () => ({
		slotInFocus: 'A' as SlotLabel,
		area: 1 as number,
		variation: 0 as number,
		moduleColor: 0 as number,
		rightPaneTab: 'modules' as PaneTab,
		showRightPane: true as boolean,
		selectedCables: [] as Cable[],
		selectedModules: [] as number[],
		showSvgViewer: false as boolean,
		cableShakeCount: 0 as number,
		draggedModuleId: null as number | null,
	}),

	getters: {
		selectedSlotIndex: (state) => SLOT_LABELS.indexOf(state.slotInFocus),
	},

	actions: {
		toggleSidebar(tab: PaneTab) {
			if (this.rightPaneTab === tab) {
				this.showRightPane = !this.showRightPane;
				if (this.showRightPane === false) {
					this.rightPaneTab = '';
				}
			} else {
				this.rightPaneTab = tab;
				this.showRightPane = true;
			}
		},

		setModuleColor(index: number) {
			this.moduleColor = index;
		},

		selectModules(indices: number[]) {
			this.selectedModules = indices;
		},

		toggleModuleSelection(index: number) {
			const i = this.selectedModules.indexOf(index);
			if (i >= 0) this.selectedModules.splice(i, 1);
			else this.selectedModules.push(index);
		},

		clearSelection() {
			this.selectedModules = [];
		},

		toggleSvgViewer() {
			this.showSvgViewer = !this.showSvgViewer;
		},

		shakeCables() {
			this.cableShakeCount++;
		},
	},
});
