import type { ComputedRef } from 'vue';
import { onMounted, onUnmounted } from 'vue';

import { SLOT_LABELS } from '@/constants';
import { usePatchClipboard } from '@/composables/usePatchClipboard';
import { usePatchFile } from '@/composables/usePatchFile';
import { usePatchOperations } from '@/composables/usePatchOperations';
import { useSettingsStore } from '@/store/settings';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

interface MenuActionOptions {
	currentModules: ComputedRef<any[]>;
	currentPatch: ComputedRef<any>;
	handleSlotClick: (idx: number) => void;
	handleVariationClick: (idx: number) => Promise<void>;
	showAbout?: () => void;
}

function isInputFocused(): boolean {
	const el = document.activeElement;
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function useElectronMenuActions(options: MenuActionOptions): void {
	const { currentModules, currentPatch, handleSlotClick, handleVariationClick } = options;
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const patchFile = usePatchFile();
	const { deleteSelection } = usePatchOperations();
	const { copySelection, cutSelection, pasteClipboard } = usePatchClipboard();

	onMounted(() => {
		window.electronAPI?.onMenuAction(async (action: string) => {
			switch (action) {
				case 'new-patch': {
					const filepath = await window.electronAPI.patches.builtinPath('EmptyPatch.pch2');
					await patchFile.handlePatchSelect({ type: 'disk', filepath });
					break;
				}
				case 'new-performance': {
					const filepath = await window.electronAPI.patches.builtinPath('EmptyPerf.prf2');
					await patchFile.handlePatchSelect({ type: 'disk', filepath });
					break;
				}
				case 'open-performance':
				case 'open':
					await patchFile.openFromElectronDialog();
					if (currentPatch.value?.description?.variation !== undefined) uiStore.variation = currentPatch.value.description.variation;
					break;
				case 'save':
					if (slotsStore.isPerformanceMode) {
						await slotsStore.savePerformance();
					} else if (slotsStore.slots[uiStore.slotInFocus]?.templateRawHex) {
						await slotsStore.saveSlot(uiStore.slotInFocus);
					}
					break;
				case 'save-as': {
					const folder = useSettingsStore().path || undefined;
					if (slotsStore.isPerformanceMode) {
						const result = await window.electronAPI.showSavePerfDialog(slotsStore.performanceName, folder);
						if (result.success && result.filepath) await slotsStore.savePerformance(result.filepath);
					} else {
						if (!slotsStore.slots[uiStore.slotInFocus]?.templateRawHex) break;
						const name = slotsStore.slots[uiStore.slotInFocus].name;
						const result = await window.electronAPI.showSaveDialog(name, folder);
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
				case 'copy': {
					if (isInputFocused()) break;
					copySelection();
					break;
				}
				case 'cut': {
					if (isInputFocused()) {
						document.execCommand('cut');
						break;
					}
					await cutSelection();
					break;
				}
				case 'paste': {
					if (isInputFocused()) break;
					await pasteClipboard();
					break;
				}
				case 'delete': {
					if (isInputFocused()) {
						document.execCommand('delete');
						break;
					}
					await deleteSelection();
					break;
				}
				case 'select-all': {
					if (isInputFocused()) {
						(document.activeElement as HTMLInputElement).select();
						break;
					}
					uiStore.selectModules(
						currentModules.value.map((m: any) => m.index as number),
						uiStore.activeArea === 1 ? 'va' : 'fx',
					);
					break;
				}
				case 'toggle-modules':
					useSettingsStore().toggleSidebar('modules');
					break;
				case 'toggle-browser':
					useSettingsStore().toggleSidebar('browser');
					break;
				case 'toggle-settings':
					useSettingsStore().toggleSidebar('settings');
					break;
				case 'area-voice':
					uiStore.setAreaMode(uiStore.area === 1 ? 2 : 1);
					break;
				case 'area-fx':
					uiStore.setAreaMode(uiStore.area === 0 ? 2 : 0);
					break;
				case 'slot-A':
					handleSlotClick(0);
					break;
				case 'slot-B':
					handleSlotClick(1);
					break;
				case 'slot-C':
					handleSlotClick(2);
					break;
				case 'slot-D':
					handleSlotClick(3);
					break;
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
				case 'toggle-midi-cc-panel':
					useSettingsStore().toggleSidebar('midicc');
					break;
				case 'show-key-commands':
					uiStore.showKeyCommandsPage = true;
					break;
				case 'undo':
					await slotsStore.undo();
					break;
				case 'redo':
					await slotsStore.redo();
					break;
				case 'show-about':
					options.showAbout?.();
					break;
				case 'show-module-help': {
					if (!uiStore.selectedModules.length) {
						uiStore.toggleAllModuleHelp();
						break;
					}
					const idx = uiStore.selectedModules[0];
					const mod = currentModules.value.find((m: any) => m.index === idx);
					if (!mod) break;
					uiStore.showModuleHelp(mod.type as number);
					break;
				}
			}
		});
	});

	onUnmounted(() => {
		window.electronAPI?.offMenuAction();
	});
}
