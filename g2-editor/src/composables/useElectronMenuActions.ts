import type { ComputedRef } from 'vue';
import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import { usePatchFile } from '@/composables/usePatchFile';
import { usePatchOperations } from '@/composables/usePatchOperations';
import { SLOT_LABELS } from '@/constants';

interface MenuActionOptions {
	currentModules: ComputedRef<any[]>;
	currentPatch: ComputedRef<any>;
	handleSlotClick: (idx: number) => void;
	handleVariationClick: (idx: number) => Promise<void>;
}

function makeEmptyPatch() {
	return {
		areas: [
			{ name: 'fx', modules: [], cableList: [], paramaterDataOfs: 0 },
			{ name: 'voice', modules: [], cableList: [], paramaterDataOfs: 0 },
		],
		description: {
			voices: 1, height: 0, unk2: 0,
			red: 1, blue: 1, yellow: 1, orange: 1, green: 1, purple: 1, white: 1,
			monopoly: 0, variation: 0, category: 0,
		},
	};
}

export function useElectronMenuActions(options: MenuActionOptions): void {
	const { currentModules, currentPatch, handleSlotClick, handleVariationClick } = options;
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const patchFile = usePatchFile();
	const { deleteSelection } = usePatchOperations();

	onMounted(() => {
		window.electronAPI?.onMenuAction(async (action: string) => {
			switch (action) {
				case 'new-patch': {
					slotsStore.loadPatchFile(uiStore.slotInFocus, makeEmptyPatch() as any, 'Untitled');
					break;
				}
				case 'new-performance': {
					const emptyPatch = makeEmptyPatch();
					slotsStore.loadPerformanceFile([emptyPatch, emptyPatch, emptyPatch, emptyPatch] as any[], [], 'Untitled Performance', '');
					break;
				}
				case 'open-performance':
				case 'open':
					await patchFile.openFromElectronDialog();
					if (currentPatch.value?.description?.variation !== undefined)
						uiStore.variation = currentPatch.value.description.variation;
					break;
				case 'save':
					if (slotsStore.isPerformanceMode) {
						await slotsStore.savePerformance();
					} else if (slotsStore.slots[uiStore.slotInFocus]?.templateRawHex) {
						await slotsStore.saveSlot(uiStore.slotInFocus);
					}
					break;
				case 'save-as': {
					if (slotsStore.isPerformanceMode) {
						const result = await window.electronAPI.showSavePerfDialog(slotsStore.performanceName);
						if (result.success && result.filepath) await slotsStore.savePerformance(result.filepath);
					} else {
						if (!slotsStore.slots[uiStore.slotInFocus]?.templateRawHex) break;
						const name = slotsStore.slots[uiStore.slotInFocus].name;
						const result = await window.electronAPI.showSaveDialog(name);
						if (result.success && result.filepath) await slotsStore.saveSlot(uiStore.slotInFocus, result.filepath);
					}
					break;
				}
				case 'save-all':
					for (const s of SLOT_LABELS) {
						if (slotsStore.slots[s]?.templateRawHex) await slotsStore.saveSlot(s);
					}
					if (slotsStore.isPerformanceMode && slotsStore.performanceRawHex) await slotsStore.savePerformance();
					break;
				case 'delete': {
					const active = document.activeElement;
					if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) break;
					await deleteSelection();
					break;
				}
				case 'select-all':
					uiStore.selectModules(currentModules.value.map((m: any) => m.index as number), uiStore.activeArea === 1 ? 'va' : 'fx');
					break;
				case 'toggle-modules':
					uiStore.toggleSidebar('modules');
					break;
				case 'toggle-browser':
					uiStore.toggleSidebar('browser');
					break;
				case 'toggle-info':
					uiStore.toggleSidebar('info');
					break;
				case 'area-voice':
					uiStore.setAreaMode(1);
					break;
				case 'area-fx':
					uiStore.setAreaMode(0);
					break;
				case 'area-split':
					uiStore.toggleSplit();
					break;
				case 'slot-A': handleSlotClick(0); break;
				case 'slot-B': handleSlotClick(1); break;
				case 'slot-C': handleSlotClick(2); break;
				case 'slot-D': handleSlotClick(3); break;
				case 'variation-1':
				case 'variation-2':
				case 'variation-3':
				case 'variation-4':
				case 'variation-5':
				case 'variation-6':
				case 'variation-7':
				case 'variation-8': {
					const variation = parseInt(action.substring(10, 11));
					await handleVariationClick(variation - 1);
					break;
				}
				case 'toggle-svg-viewer':
					uiStore.toggleSvgViewer();
					break;
			}
		});
	});

	onUnmounted(() => {
		window.electronAPI?.offMenuAction();
	});
}
