<template>
	<svg style="position: absolute; width: 0; height: 0; overflow: hidden" aria-hidden="true">
		<SvgGradientDefs />
	</svg>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel class="w-8">Perf:</ToolBarLabel>
				<ToolBarText class="w-36 cursor-pointer hover:text-white" @click="handlePerfNameClick">{{ device.perfName }}</ToolBarText>
				<ToolBarLabel>Clk:</ToolBarLabel>
				<ToolBarText class="w-13 cursor-pointer hover:text-white" @click="handleBpmClick">{{ device.bpm }}</ToolBarText>
				<Button variant="toggle" :active="device.clockRunning" @click="device.setClockRunning(!device.clockRunning)">Run</Button>
				<ToolBarDivider />
				<BtnGroup
					:model-value="uiStore.selectedSlotIndex"
					:options="SLOT_OPTIONS"
					:top-indicators="device.getSlotsKeyStatus"
					:bottom-indicators="device.getSlotsActiveStatus"
					variant="toggle"
					testIdPrefix="slot"
					@update:model-value="handleSlotClick"
					@shift-click="handleSlotShiftClick"
					@ctrl-click="handleSlotCtrlClick"
				/>
				<ToolBarDivider />
				<ToolBarText class="w-32">{{ device.deviceName || '---' }}</ToolBarText>
				<Button variant="toggle" :active="device.device?.mode === 'Performance'" @click="handlePerfModeToggle()">Perf</Button>
				<ToolBarDivider />
				<CPU :va="device.activeSlotResources.va" :fx="device.activeSlotResources.fx" />
			</template>

			<div
				class="rounded ml-auto h-full flex items-center justify-center gap-2 px-2 border-l-4 border-r-4 cursor-pointer w-20"
				:class="device.statusClass"
				data-testid="connection-status"
				@click="toggleConnection"
			>
				<span class="text-sm">{{ device.statusLabel }}</span>
			</div>
		</ToolBar>

		<PatchToolBar :patch-name="patchName" @variation-click="handleVariationClick" @patch-name-click="handlePatchNameClick" />

		<div class="flex-1 flex overflow-hidden">
			<div class="flex-1 overflow-auto bg-neutral-900 relative">
				<template v-if="currentPatch">
					<PatchCanvas
						v-show="uiStore.area === 1"
						:key="patchName + '-voice'"
						:modules="voiceModules"
						:cables="voiceCables"
						:variation="uiStore.variation"
						area="va"
						:selected-cables="uiStore.selectedCables"
						:selected-module-indices="uiStore.selectedModules"
						@jack-drag-start="jackPatching.handleJackDragStart"
						@jack-drag-end="jackPatching.handleJackDragEnd"
						@module-move="handleModuleMove"
						@module-drop="handleModuleDrop"
						@mode-change="handleModeChange"
						@param-change="handleParamChange"
						@module-label-edit="handleModuleLabelEdit"
						@module-delete="handleModuleDelete"
						@module-color-change="handleModuleColorChange"
						@jack-delete-connected="handleJackDeleteConnected"
						@jack-set-cable-color="handleJackSetCableColor"
						@param-label-edit="handleParamLabelEdit"
					/>
					<PatchCanvas
						v-show="uiStore.area === 0"
						:key="patchName + '-fx'"
						:modules="fxModules"
						:cables="fxCables"
						:variation="uiStore.variation"
						area="fx"
						:selected-cables="uiStore.selectedCables"
						:selected-module-indices="uiStore.selectedModules"
						@jack-drag-start="jackPatching.handleJackDragStart"
						@jack-drag-end="jackPatching.handleJackDragEnd"
						@module-move="handleModuleMove"
						@module-drop="handleModuleDrop"
						@mode-change="handleModeChange"
						@param-change="handleParamChange"
						@module-label-edit="handleModuleLabelEdit"
						@module-delete="handleModuleDelete"
						@module-color-change="handleModuleColorChange"
						@jack-delete-connected="handleJackDeleteConnected"
						@jack-set-cable-color="handleJackSetCableColor"
						@param-label-edit="handleParamLabelEdit"
					/>
				</template>
			</div>

			<SidePanel v-if="uiStore.showRightPane">
				<ModulesPane v-show="uiStore.rightPaneTab === 'modules'" :isActive="uiStore.rightPaneTab === 'modules'" />
				<PatchBrowser
					v-show="uiStore.rightPaneTab === 'browser'"
					:isActive="uiStore.rightPaneTab === 'browser'"
					@select="patchFile.handlePatchSelect"
				/>
				<SettingsPane v-show="uiStore.rightPaneTab === 'settings'" />
			</SidePanel>
		</div>

		<StatusBar />

		<SvgViewer v-if="uiStore.showSvgViewer" />
	</div>

	<Dialog v-model="showParamLabelDialog" title="Rename Label" @confirm="confirmParamLabel" @cancel="showParamLabelDialog = false">
		<input
			v-model="editingParamLabel"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showLabelDialog" title="Rename Module" @confirm="confirmModuleLabel" @cancel="showLabelDialog = false">
		<input
			v-model="editingLabel"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showPatchNameDialog" title="Rename Patch" @confirm="confirmPatchName" @cancel="showPatchNameDialog = false">
		<input
			v-model="editingPatchName"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showPerfNameDialog" title="Rename Performance" @confirm="confirmPerfName" @cancel="showPerfNameDialog = false">
		<input
			v-model="editingPerfName"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showBpmDialog" title="Set BPM" @confirm="confirmBpm" @cancel="showBpmDialog = false">
		<input
			v-model.number="editingBpm"
			type="number"
			min="30"
			max="240"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
		/>
	</Dialog>

	<LoadingOverlay :show="isLoading" :message="loadingMessage" />

	<ContextMenu v-if="ctxState.visible" :items="ctxState.items" :x="ctxState.x" :y="ctxState.y" @close="closeCtxMenu" />
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
	import PatchCanvas from './components/canvas/PatchCanvas.vue';
	import PatchBrowser from './components/panels/PatchBrowser.vue';
	import SidePanel from './components/panels/SidePanel.vue';
	import ModulesPane from './components/panels/ModulesPane.vue';
	import Button from './components/toolbar/Button.vue';
	import BtnGroup from './components/toolbar/BtnGroup.vue';
	import ToolBar from './components/toolbar/ToolBar.vue';
	import ToolBarLabel from './components/toolbar/ToolBarLabel.vue';
	import ToolBarText from './components/toolbar/ToolBarText.vue';
	import ToolBarDivider from './components/toolbar/ToolBarDivider.vue';
	import PatchToolBar from './components/toolbar/PatchToolBar.vue';
	import StatusBar from './components/toolbar/StatusBar.vue';
	import Dialog from './components/common/Dialog.vue';
	import LoadingOverlay from './components/common/LoadingOverlay.vue';
	import ContextMenu from './components/common/ContextMenu.vue';
	import { useContextMenu } from './composables/useContextMenu';
	import SvgGradientDefs from './components/canvas/SvgGradientDefs.vue';
	import SvgViewer from './components/canvas/SvgViewer.vue';
	import CPU from './components/toolbar/CPU.vue';

	import { useG2 } from './composables/useG2';
	import { useJackPatching } from './composables/useJackPatching';
	import { usePatchFile } from './composables/usePatchFile';
	import { useModuleLabelDialog } from './composables/useModuleLabelDialog';
	import { usePatchOperations } from './composables/usePatchOperations';
	import { useDeviceStore } from './store/device';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { SlotLabel } from './store/slots';
	import { useBrowserStore } from './store/browser';

	import { SLOT_LABELS, SLOT_OPTIONS } from './constants';
	import SettingsPane from './components/panels/SettingsPane.vue';

	const { state: ctxState, close: closeCtxMenu } = useContextMenu();

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const browserStore = useBrowserStore();
	const jackPatching = useJackPatching();
	const patchFile = usePatchFile();

	const isLoading = computed(() =>
		device.status === 'connecting' ||
		device.modeChanging ||
		slotsStore.uploadingFromFile ||
		Object.values(slotsStore.slots).some((s) => s.loading),
	);
	const loadingMessage = computed(() => {
		if (device.status === 'connecting') return 'Connecting...';
		if (device.modeChanging) return 'Loading performance...';
		if (slotsStore.uploadingFromFile) return 'Loading file...';
		return 'Loading patch...';
	});

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));
	const voiceModules = computed(() => slotsStore.getAreaModules(uiStore.slotInFocus, 1));
	const voiceCables = computed(() => slotsStore.getAreaCables(uiStore.slotInFocus, 1));
	const fxModules = computed(() => slotsStore.getAreaModules(uiStore.slotInFocus, 0));
	const fxCables = computed(() => slotsStore.getAreaCables(uiStore.slotInFocus, 0));
	const currentModules = computed(() => (uiStore.area === 1 ? voiceModules.value : fxModules.value));
	const patchName = computed(() => slotsStore.getPatchName(uiStore.slotInFocus));

	function applySlotResult(result: { patch: any; name: string } | null): void {
		if (result?.patch?.description?.variation !== undefined) {
			uiStore.variation = result.patch.description.variation;
		}
	}

	const {
		showLabelDialog,
		editingLabel,
		showParamLabelDialog,
		editingParamLabel,
		handleModuleLabelEdit,
		confirmModuleLabel,
		handleParamLabelEdit,
		confirmParamLabel,
	} = useModuleLabelDialog();

	const {
		deleteSelection,
		handleModuleMove,
		handleModuleDrop,
		handleParamChange,
		handleModeChange,
		handleModuleDelete,
		handleModuleColorChange,
		handleJackDeleteConnected,
		handleJackSetCableColor,
	} = usePatchOperations();

	// ── Patch name dialog ─────────────────────────────────────────────────────

	const showPatchNameDialog = ref(false);
	const editingPatchName = ref('');

	function handlePatchNameClick(): void {
		editingPatchName.value = patchName.value;
		showPatchNameDialog.value = true;
	}
	async function confirmPatchName(): Promise<void> {
		await slotsStore.setPatchName(editingPatchName.value);
		showPatchNameDialog.value = false;
	}

	// ── Perf name dialog ──────────────────────────────────────────────────────

	const showPerfNameDialog = ref(false);
	const editingPerfName = ref('');

	function handlePerfNameClick(): void {
		editingPerfName.value = device.perfName;
		showPerfNameDialog.value = true;
	}
	async function confirmPerfName(): Promise<void> {
		await device.setPerfName(editingPerfName.value);
		showPerfNameDialog.value = false;
	}

	// ── BPM dialog ────────────────────────────────────────────────────────────

	const showBpmDialog = ref(false);
	const editingBpm = ref(0);

	function handleBpmClick(): void {
		editingBpm.value = device.bpm;
		showBpmDialog.value = true;
	}
	async function confirmBpm(): Promise<void> {
		const val = Math.max(30, Math.min(240, editingBpm.value));
		await device.setBpm(val);
		showBpmDialog.value = false;
	}

	// ── Keyboard ──────────────────────────────────────────────────────────────

	async function handleDeleteKey(e: KeyboardEvent): Promise<void> {
		if (showLabelDialog.value) return;
		if (e.key !== 'Delete' && e.key !== 'Backspace') return;
		await deleteSelection();
	}

	// ── Slot / variation ──────────────────────────────────────────────────────

	async function handleSlotClick(value: string | number | (string | number)[]): Promise<void> {
		const idx = value as number;
		const slot = SLOT_LABELS[idx];
		uiStore.setSlotInFocus(slot);
		if (device.device?.slots) {
			for (const entry of device.device.slots) {
				entry.key = entry.slot === slot;
			}
		}
		const patch = slotsStore.slots[slot]?.patch;
		if (patch?.description?.variation !== undefined) uiStore.variation = patch.description.variation;
		if (device.status === 'connected') applySlotResult(await slotsStore.selectSlot(slot));
	}

	function handleSlotShiftClick(value: string | number): void {
		device.toggleSlotActive(SLOT_LABELS[value as number]);
	}

	function handleSlotCtrlClick(value: string | number): void {
		device.toggleSlotKey(SLOT_LABELS[value as number]);
	}

	async function handleVariationClick(value: string | number | (string | number)[]): Promise<void> {
		const idx = value as number;
		uiStore.variation = idx;
		const patch = slotsStore.slots[uiStore.slotInFocus]?.patch;
		if (patch?.description) patch.description.variation = idx;
		if (device.status === 'connected') await slotsStore.selectVariation(idx);
	}

	// ── G2 connection ─────────────────────────────────────────────────────────

	const { connectDevice, toggleConnection, hardwareVariationChange, hardwareSlotChange } = useG2();

	async function handlePerfModeToggle(): Promise<void> {
		try {
			await device.togglePerfMode();
		} catch (e: any) {
			console.error('togglePerfMode failed:', e?.message ?? e);
		}
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onMounted(async () => {
		window.addEventListener('keydown', handleDeleteKey);

		window.electronAPI?.onMenuAction(async (action: string) => {
			// const area = uiStore.area === 1 ? 'voice' : 'fx';
			switch (action) {
				case 'new-patch': {
					const emptyPatch = {
						areas: [
							{ name: 'fx', modules: [], cableList: [], paramaterDataOfs: 0 },
							{ name: 'voice', modules: [], cableList: [], paramaterDataOfs: 0 },
						],
						description: { voices: 1, height: 0, unk2: 0, red: 1, blue: 1, yellow: 1, orange: 1, green: 1, purple: 1, white: 1, monopoly: 0, variation: 0, category: 0 },
					};
					slotsStore.loadPatchFile(uiStore.slotInFocus, emptyPatch as any, 'Untitled');
					break;
				}
				case 'new-performance': {
					const emptyPatch = {
						areas: [
							{ name: 'fx', modules: [], cableList: [], paramaterDataOfs: 0 },
							{ name: 'voice', modules: [], cableList: [], paramaterDataOfs: 0 },
						],
						description: { voices: 1, height: 0, unk2: 0, red: 1, blue: 1, yellow: 1, orange: 1, green: 1, purple: 1, white: 1, monopoly: 0, variation: 0, category: 0 },
					};
					const emptyPatches = [emptyPatch, emptyPatch, emptyPatch, emptyPatch] as any[];
					slotsStore.loadPerformanceFile(emptyPatches, [], 'Untitled Performance', '');
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
				case 'delete':
					await deleteSelection();
					break;
				case 'select-all':
					uiStore.selectModules(currentModules.value.map((m: any) => m.index as number));
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
				case 'area-fx':
					if (uiStore.area === 1) {
						uiStore.area = 0;
					} else {
						uiStore.area = 1;
					}
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
			}
		});

		const isOffline = import.meta.env.DEV_OFFLINE === 'true';
		if (isOffline) {
			device.status = 'offline';
		} else {
			await connectDevice();
		}
		if (!isOffline && device.status === 'connected') {
			const focusedEntry = device.device?.slots?.find(s => s.key);
			const focusLabel = (focusedEntry?.slot ?? 'A') as SlotLabel;
			const idx = SLOT_LABELS.indexOf(focusLabel);
			if (idx >= 0) {
				const slot = SLOT_LABELS[idx];
				uiStore.setSlotInFocus(slot);
				applySlotResult(await slotsStore.loadSlot(slot));
			}
			if (device.startupNames) {
				browserStore.applyNamesData(device.startupNames);
			} else {
				browserStore.loadSynthList();
			}
		}
	});

	onUnmounted(() => {
		window.removeEventListener('keydown', handleDeleteKey);
		window.electronAPI?.offMenuAction();
	});

	// ── Watches ───────────────────────────────────────────────────────────────

	watch(hardwareSlotChange, async (slot) => {
		if (slot === null) return;
		uiStore.setSlotInFocus(slot);
		if (device.status === 'connected') applySlotResult(await slotsStore.loadSlot(slot));
	});

	watch(hardwareVariationChange, (change) => {
		if (!change) return;
		if (change.slot !== uiStore.slotInFocus) return;
		uiStore.variation = change.variation;
		const activePatch = slotsStore.slots[uiStore.slotInFocus]?.patch;
		if (activePatch?.description) activePatch.description.variation = change.variation;
	});
</script>
