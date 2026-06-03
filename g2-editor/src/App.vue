<template>
	<svg style="position: absolute; width: 0; height: 0; overflow: hidden" aria-hidden="true">
		<SvgGradientDefs />
	</svg>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel class="w-8">Perf:</ToolBarLabel>
				<ToolBarText class="w-36 cursor-pointer hover:text-white" @click="openPerfNameDialog">{{ device.perfName }}</ToolBarText>
				<ToolBarLabel>Clk:</ToolBarLabel>
				<ToolBarText class="w-13 cursor-pointer hover:text-white" @click="openBpmDialog">{{ device.bpm }}</ToolBarText>
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
				<CPU :va="slotsStore.activeSlotResources.va" :fx="slotsStore.activeSlotResources.fx" />
			</template>

			<button class="status-badge ml-auto" :class="device.statusClass" data-testid="connection-status" @click="toggleConnection">
				<span class="status-dot" :class="device.dotClass" />
				<span>{{ device.statusLabel }}</span>
			</button>
		</ToolBar>

		<PatchToolBar :patch-name="patchName" @variation-click="handleVariationClick" @patch-name-click="() => openPatchNameDialog(patchName)" />

		<div class="flex-1 flex overflow-hidden">
			<div class="flex-1 bg-neutral-700 relative">
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

	<Dialog v-model="showPatchNameDialog" title="Rename Patch" @confirm="confirmPatchName" @cancel="cancelPatchNameDialog">
		<input
			v-model="editingPatchName"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showPerfNameDialog" title="Rename Performance" @confirm="confirmPerfName" @cancel="cancelPerfNameDialog">
		<input
			v-model="editingPerfName"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showBpmDialog" title="Set BPM" @confirm="confirmBpm" @cancel="cancelBpmDialog">
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
	import { computed, onMounted, onUnmounted } from 'vue';
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
	import { usePatchNameDialog } from './composables/usePatchNameDialog';
	import { usePerfNameDialog } from './composables/usePerfNameDialog';
	import { useBpmDialog } from './composables/useBpmDialog';
	import { useSlotManagement } from './composables/useSlotManagement';
	import { useElectronMenuActions } from './composables/useElectronMenuActions';
	import { DeviceStatus, useDeviceStore } from './store/device';
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

	const isLoading = computed(
		() =>
			device.status === DeviceStatus.Connecting ||
			device.modeChanging ||
			slotsStore.uploadingFromFile ||
			Object.values(slotsStore.slots).some((s) => s.loading),
	);
	const loadingMessage = computed(() => {
		if (device.status === DeviceStatus.Connecting) return 'Connecting...';
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

	const {
		showDialog: showPatchNameDialog,
		editingName: editingPatchName,
		open: openPatchNameDialog,
		confirm: confirmPatchName,
		cancel: cancelPatchNameDialog,
	} = usePatchNameDialog();

	const {
		showDialog: showPerfNameDialog,
		editingName: editingPerfName,
		open: openPerfNameDialog,
		confirm: confirmPerfName,
		cancel: cancelPerfNameDialog,
	} = usePerfNameDialog();

	const { showDialog: showBpmDialog, editingBpm, open: openBpmDialog, confirm: confirmBpm, cancel: cancelBpmDialog } = useBpmDialog();

	const { connectDevice, toggleConnection, hardwareVariationChange, hardwareSlotChange } = useG2();

	const { handleSlotClick, handleSlotShiftClick, handleSlotCtrlClick, handleVariationClick, applySlotResult } = useSlotManagement(
		hardwareSlotChange,
		hardwareVariationChange,
	);

	useElectronMenuActions({ currentModules, currentPatch, handleSlotClick, handleVariationClick });

	async function handlePerfModeToggle(): Promise<void> {
		try {
			await device.togglePerfMode();
		} catch (e: any) {
			console.error('togglePerfMode failed:', e?.message ?? e);
		}
	}

	async function handleDeleteKey(e: KeyboardEvent): Promise<void> {
		if (showLabelDialog.value) return;
		if (e.key !== 'Delete' && e.key !== 'Backspace') return;
		await deleteSelection();
	}

	onMounted(async () => {
		window.addEventListener('keydown', handleDeleteKey);

		const isOffline = import.meta.env.VITE_DEV_OFFLINE === 'true';
		if (isOffline) {
			device.status = DeviceStatus.Offline;
		} else {
			await connectDevice();
		}
		if (!isOffline && device.status === DeviceStatus.Connected) {
			const focusedEntry = device.device?.slots?.find((s) => s.key);
			const focusLabel = (focusedEntry?.slot ?? 'A') as SlotLabel;
			const idx = SLOT_LABELS.indexOf(focusLabel);
			if (idx >= 0) {
				const slot = SLOT_LABELS[idx];
				uiStore.setSlotInFocus(slot);
				applySlotResult(await slotsStore.loadSlot(slot));
			}
			if (!browserStore.synthPatches.length) {
				browserStore.loadSynthList();
			}
		}
	});

	onUnmounted(() => {
		window.removeEventListener('keydown', handleDeleteKey);
	});
</script>
