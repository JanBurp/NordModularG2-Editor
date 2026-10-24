import type { ComputedRef } from 'vue';
import { computed, onMounted, onUnmounted, watch } from 'vue';

import { SLOT_LABELS } from '@/constants';
import type { SlotLabel } from '@/types';
import { usePatchClipboard } from '@/composables/usePatchClipboard';
import { usePatchFile } from '@/composables/usePatchFile';
import { usePatchOperations } from '@/composables/usePatchOperations';
import { useDeviceStore } from '@/store/device';
import { useMutatorStore } from '@/store/mutator';
import { useUndoTarget } from './useUndoTarget';
import { useSettingsStore } from '@/store/settings';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { useBankDownloadDialog } from '@/composables/useBankDownloadDialog';
import { useBankUploadDialog } from '@/composables/useBankUploadDialog';
import { useDownloadToSlotDialog } from '@/composables/useDownloadToSlotDialog';
import { useStoreInSynthDialog } from '@/composables/useStoreInSynthDialog';
import { showToast } from '@/composables/useToast';

interface MenuActionOptions {
	currentModules: ComputedRef<any[]>;
	currentPatch: ComputedRef<any>;
	handleSlotClick: (idx: number) => void;
	handleVariationClick: (idx: number) => Promise<void>;
	showAbout?: () => void;
}

// Keyboard focus inside the Patch Mutator pane: keys 1-8 pick a mutator box instead of a variation.
function isMutatorFocused(): boolean {
	return document.activeElement?.closest('[data-mutator-pane]') != null;
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
	const { deleteSelection, deleteUnusedModules, deleteUnusedCables } = usePatchOperations();
	const { copySelection, cutSelection, pasteClipboard, pasteParams, hasClipboard } = usePatchClipboard();
	const deviceStore = useDeviceStore();
	const undoTarget = useUndoTarget();
	const bankUploadDialog = useBankUploadDialog();
	const bankDownloadDialog = useBankDownloadDialog();

	const menuState = computed(() => ({
		connected: deviceStore.connected,
		canUndo: undoTarget.canUndo.value,
		canRedo: undoTarget.canRedo.value,
		hasSelection: uiStore.selectedModules.length > 0,
		hasClipboard: hasClipboard.value,
		hasCurrentPatch: !!currentPatch.value,
		hasPerformanceContext: !!slotsStore.performanceRawHex,
		isPerformanceMode: slotsStore.isPerformanceMode || deviceStore.isHardwarePerformanceMode,
	}));
	watch(menuState, (state) => window.electronAPI?.updateMenuState(state), { immediate: true });

	function syncVariationFromCurrentPatch(): void {
		if (currentPatch.value?.description?.variation !== undefined) uiStore.variation = currentPatch.value.description.variation;
	}

	onMounted(() => {
		// Cold-start hydration: the persisted recent-files list lives in the renderer
		// (pinia-plugin-persistedstate), so the native menu (built empty at startup) needs it once.
		// IPC uses structured clone, which chokes on Pinia's reactive Proxy — send plain objects.
		window.electronAPI?.updateRecentFiles(useSettingsStore().recentFiles.map((f) => ({ ...f })));

		window.electronAPI?.onMenuAction(async (action: string) => {
			if (deviceStore.resyncing) return; // edits would collide with the post-reconnect performance re-send
			if (action.startsWith('open-recent:')) {
				const entry = useSettingsStore().recentFiles[Number(action.slice('open-recent:'.length))];
				if (entry) await patchFile.handlePatchSelect({ type: 'disk', filepath: entry.path, kind: entry.kind });
				return;
			}
			switch (action) {
				case 'new-patch':
					await patchFile.newPatch();
					break;
				case 'new-to-A':
				case 'new-to-B':
				case 'new-to-C':
				case 'new-to-D':
					await patchFile.newPatch(action.slice(-1) as SlotLabel);
					break;
				case 'new-performance': {
					const filepath = await window.electronAPI.patches.builtinPath('EmptyPerf.prf2');
					await patchFile.handlePatchSelect({ type: 'disk', filepath });
					break;
				}
				case 'open-performance':
					await patchFile.openFromElectronDialog(undefined, 'performance');
					syncVariationFromCurrentPatch();
					break;
				case 'open':
					await patchFile.openFromElectronDialog(undefined, 'patch');
					syncVariationFromCurrentPatch();
					break;
				case 'open-to-A':
				case 'open-to-B':
				case 'open-to-C':
				case 'open-to-D':
					await patchFile.openFromElectronDialog(action.slice(-1) as SlotLabel, 'patch');
					syncVariationFromCurrentPatch();
					break;
				case 'save-from-A':
				case 'save-from-B':
				case 'save-from-C':
				case 'save-from-D':
					await slotsStore.saveSlot(action.slice(-1) as SlotLabel);
					break;
				case 'save':
					if (slotsStore.isPerformanceMode || deviceStore.isHardwarePerformanceMode) {
						await slotsStore.savePerformance();
					} else if (slotsStore.slots[uiStore.slotInFocus]?.templateRawHex) {
						await slotsStore.saveSlot(uiStore.slotInFocus);
					}
					break;
				case 'save-as': {
					const folder = useSettingsStore().path || undefined;
					if (slotsStore.isPerformanceMode || deviceStore.isHardwarePerformanceMode) {
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
				case 'save-init-1':
				case 'save-init-2': {
					const slotNum = action === 'save-init-1' ? 1 : 2;
					const filepath = await window.electronAPI.patches.initSavePath(slotNum);
					await slotsStore.exportSlotToFile(uiStore.slotInFocus, filepath);
					break;
				}
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
				case 'paste-params': {
					if (isInputFocused()) break;
					await pasteParams();
					break;
				}
				case 'delete': {
					if (isInputFocused()) {
						document.execCommand('delete');
						break;
					}
					if (isMutatorFocused()) break;
					if (uiStore.hoveredJack) {
						const { moduleIndex, connectorIndex, type, area } = uiStore.hoveredJack;
						await slotsStore.breakJackConnection(moduleIndex, connectorIndex, type, area === 'va' ? 'voice' : 'fx');
						break;
					}
					await deleteSelection();
					break;
				}
				case 'delete-unused-modules': {
					await deleteUnusedModules();
					break;
				}
				case 'delete-unused-cables': {
					await deleteUnusedCables();
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
					useSettingsStore().openSettingsSection('Editor Settings');
					break;
				case 'open-patch-settings':
					useSettingsStore().openSettingsSection('Patch Settings');
					break;
				case 'open-performance-settings':
					useSettingsStore().openSettingsSection('Performance Settings');
					break;
				case 'open-synth-settings':
					useSettingsStore().openSettingsSection('Synth Settings');
					break;
				case 'download-to-slot':
					useDownloadToSlotDialog().open();
					break;
				case 'download-performance':
					// downloadPerformanceToSynth reports its own outcome via toast (including
					// the "temporarily disabled" case — see its own doc comment).
					await slotsStore.downloadPerformanceToSynth();
					break;
				case 'upload-active-slot': {
					const hardwareActive = deviceStore.device?.slots?.find((s) => s.key)?.slot;
					const slot = hardwareActive ?? uiStore.slotInFocus;
					await slotsStore.loadSlot(slot);
					showToast(`Loaded slot ${slot} from G2`);
					break;
				}
				case 'store-in-synth':
					if (isInputFocused()) break;
					useStoreInSynthDialog().open();
					break;
				case 'area-voice':
					if (isInputFocused()) break;
					uiStore.setAreaMode(uiStore.area === 1 ? 2 : 1);
					break;
				case 'area-fx':
					if (isInputFocused()) break;
					uiStore.setAreaMode(uiStore.area === 0 ? 2 : 0);
					break;
				case 'slot-A':
					if (isInputFocused()) break;
					handleSlotClick(0);
					break;
				case 'slot-B':
					if (isInputFocused()) break;
					handleSlotClick(1);
					break;
				case 'slot-C':
					if (isInputFocused()) break;
					handleSlotClick(2);
					break;
				case 'slot-D':
					if (isInputFocused()) break;
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
					if (isInputFocused()) break;
					const variation = parseInt(action.substring(10, 11));
					if (isMutatorFocused()) await useMutatorStore().focusNumber(variation);
					else await handleVariationClick(variation - 1);
					break;
				}
				case 'toggle-svg-viewer':
					uiStore.toggleSvgViewer();
					break;
				case 'toggle-midi-cc-panel':
					useSettingsStore().toggleSidebar('midicc');
					break;
				case 'toggle-parameter-overview':
					useSettingsStore().toggleSidebar('overview');
					break;
				case 'toggle-patch-mutator':
					useSettingsStore().toggleSidebar('mutator');
					break;
				case 'toggle-bank-organizer':
					uiStore.toggleBankOrganizer();
					break;
				case 'toggle-text-panel':
					useSettingsStore().toggleSidebar('text');
					break;
				case 'toggle-extended-toolbar':
					useSettingsStore().cycleToolbarMode();
					break;
				case 'toggle-keyboard':
					useSettingsStore().toggleVirtualKeyboard();
					break;
				case 'toggle-parameter-pages':
					useSettingsStore().toggleParamPages();
					break;
				case 'show-key-commands':
					uiStore.showKeyCommandsPage = true;
					break;
				case 'zoom-in':
					useSettingsStore().zoomIn();
					break;
				case 'zoom-out':
					useSettingsStore().zoomOut();
					break;
				case 'zoom-reset':
					useSettingsStore().resetCanvasZoom();
					break;
				case 'undo':
					await undoTarget.undo();
					break;
				case 'redo':
					await undoTarget.redo();
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
				case 'send-controller-snapshot': {
					if (isInputFocused()) break;
					const snapshotOk = await deviceStore.sendControllerSnapshot();
					if (snapshotOk) showToast('Controller snapshot sent to MIDI OUT');
					break;
				}
				case 'dump-one': {
					if (isInputFocused()) break;
					const dumpOk = await slotsStore.dumpOne();
					if (dumpOk) showToast('Patch dumped as MIDI SYSEX');
					break;
				}
				case 'bank-upload':
					if (isInputFocused()) break;
					bankUploadDialog.open();
					break;
				case 'bank-download':
					if (isInputFocused()) break;
					bankDownloadDialog.open();
					break;
			}
		});
	});

	// Files opened from the OS (double-click / "Open With" / dock drop) arrive via main.
	onMounted(() => {
		window.electronAPI?.onOpenFile(async (filepath: string) => {
			const kind = /\.prf2$/i.test(filepath) ? 'performance' : 'patch';
			useSettingsStore().addRecentFile(filepath, kind);
			await patchFile.handlePatchSelect({ type: 'disk', filepath, kind });
			syncVariationFromCurrentPatch();
		});
	});

	onUnmounted(() => {
		window.electronAPI?.offOpenFile();
		window.electronAPI?.offMenuAction();
	});
}
