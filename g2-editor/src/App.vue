<template>
	<svg style="position: absolute; width: 0; height: 0; overflow: hidden" aria-hidden="true">
		<SvgGradientDefs />
	</svg>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel class="w-10">Perf:</ToolBarLabel>
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
				<ToolBarText class="w-32">{{ device.device?.synthName || '---' }}</ToolBarText>
				<Button variant="toggle" :active="device.device?.mode === 'Performance'" @click="handlePerfModeToggle()">Perf</Button>
				<ToolBarDivider />
				<CPU :va="slotsStore.activeSlotResources.va" :fx="slotsStore.activeSlotResources.fx" />
			</template>

			<button class="status-badge ml-auto" :class="device.statusClass" data-testid="connection-status" @click="toggleConnection">
				<span class="status-dot" :class="device.dotClass" />
				<span>{{ device.statusLabel }}</span>
			</button>
		</ToolBar>

		<MorphToolBar :patch-name="patchName" />
		<PatchToolBar :patch-name="patchName" @variation-click="handleVariationClick" @patch-name-click="() => openPatchNameDialog(patchName)" />

		<div class="flex-1 flex overflow-hidden">
			<div ref="canvasAreaRef" class="flex-1 min-w-0 bg-neutral-700 flex flex-col overflow-hidden">
				<template v-if="currentPatch">
					<div v-show="showVoice" class="relative overflow-hidden min-h-0" :class="{ 'flex-1': !isSplit }" :style="voiceWrapperStyle">
						<PatchCanvas
							:key="patchName + '-voice'"
							:modules="voiceModules"
							:cables="voiceCables"
							:variation="uiStore.variation"
							area="va"
							:selected-cables="uiStore.selectedCables"
							:selected-module-indices="voiceSelectedModules"
							@jack-drag-start="jackPatching.handleJackDragStart"
							@jack-drag-end="jackPatching.handleJackDragEnd"
							@module-move="voiceOps.handleModuleMove"
							@module-drop="voiceOps.handleModuleDrop"
							@mode-change="voiceOps.handleModeChange"
							@param-change="voiceOps.handleParamChange"
							@module-label-edit="handleModuleLabelEdit"
							@module-delete="voiceOps.handleModuleDelete"
							@module-color-change="voiceOps.handleModuleColorChange"
							@jack-delete-connected="voiceOps.handleJackDeleteConnected"
							@jack-set-cable-color="voiceOps.handleJackSetCableColor"
							@param-label-edit="handleParamLabelEdit"
						/>
					</div>

					<div v-if="isSplit" class="divider-handle" @mousedown="startDividerDrag" />

					<div v-show="showFx" class="relative overflow-hidden min-h-0 flex-1">
						<PatchCanvas
							:key="patchName + '-fx'"
							:modules="fxModules"
							:cables="fxCables"
							:variation="uiStore.variation"
							area="fx"
							:selected-cables="uiStore.selectedCables"
							:selected-module-indices="fxSelectedModules"
							@jack-drag-start="jackPatching.handleJackDragStart"
							@jack-drag-end="jackPatching.handleJackDragEnd"
							@module-move="fxOps.handleModuleMove"
							@module-drop="fxOps.handleModuleDrop"
							@mode-change="fxOps.handleModeChange"
							@param-change="fxOps.handleParamChange"
							@module-label-edit="handleModuleLabelEdit"
							@module-delete="fxOps.handleModuleDelete"
							@module-color-change="fxOps.handleModuleColorChange"
							@jack-delete-connected="fxOps.handleJackDeleteConnected"
							@jack-set-cable-color="fxOps.handleJackSetCableColor"
							@param-label-edit="handleParamLabelEdit"
						/>
					</div>
				</template>
			</div>

			<SidePanel v-if="uiStore.showRightPane" />
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

	<AboutDialog v-model="showAboutDialog" />

	<LoadingOverlay :show="isLoading" :message="loadingMessage" />

	<DriverErrorDialog @retry="toggleConnection" />

	<ParamEditDialog />

	<ContextMenu v-if="ctxState.visible" :items="ctxState.items" :x="ctxState.x" :y="ctxState.y" @close="closeCtxMenu" />
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref } from 'vue';
	import PatchCanvas from './components/canvas/PatchCanvas.vue';
	import SidePanel from './components/panels/SidePanel.vue';
	import Button from './components/toolbar/Button.vue';
	import BtnGroup from './components/toolbar/BtnGroup.vue';
	import ToolBar from './components/toolbar/ToolBar.vue';
	import ToolBarLabel from './components/toolbar/ToolBarLabel.vue';
	import ToolBarText from './components/toolbar/ToolBarText.vue';
	import ToolBarDivider from './components/toolbar/ToolBarDivider.vue';
	import MorphToolBar from './components/toolbar/MorphToolBar.vue';
	import PatchToolBar from './components/toolbar/PatchToolBar.vue';
	import StatusBar from './components/toolbar/StatusBar.vue';
	import Dialog from './components/common/Dialog.vue';
	import LoadingOverlay from './components/common/LoadingOverlay.vue';
	import ContextMenu from './components/common/ContextMenu.vue';
	import { useContextMenu } from './composables/useContextMenu';
	import SvgGradientDefs from './components/canvas/SvgGradientDefs.vue';
	import SvgViewer from './components/canvas/SvgViewer.vue';
	import CPU from './components/toolbar/CPU.vue';

	import { useAreaMode } from './composables/useAreaMode';
	import { useG2 } from './composables/useG2';
	import { useJackPatching } from './composables/useJackPatching';
	import { useModuleLabelDialog } from './composables/useModuleLabelDialog';
	import { usePatchOperations } from './composables/usePatchOperations';
	import { usePatchNameDialog } from './composables/usePatchNameDialog';
	import { usePerfNameDialog } from './composables/usePerfNameDialog';
	import { useBpmDialog } from './composables/useBpmDialog';
	import { useSlotManagement } from './composables/useSlotManagement';
	import { useElectronMenuActions } from './composables/useElectronMenuActions';
	import { useModuleKeyboard } from './composables/useModuleKeyboard';
	import ParamEditDialog from './components/common/ParamEditDialog.vue';
	import AboutDialog from './components/common/AboutDialog.vue';
	import DriverErrorDialog from './components/common/DriverErrorDialog.vue';
	import { DeviceStatus, useDeviceStore } from './store/device';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { SlotLabel } from './store/slots';
	import { useBrowserStore } from './store/browser';

	import { SLOT_LABELS, SLOT_OPTIONS } from './constants';

	const { state: ctxState, close: closeCtxMenu } = useContextMenu();

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const browserStore = useBrowserStore();
	const jackPatching = useJackPatching();

	const canvasAreaRef = ref<HTMLElement | null>(null);
	const { isSplit, showVoice, showFx, voiceWrapperStyle, startDividerDrag } = useAreaMode(canvasAreaRef);

	const isLoading = computed(
		() =>
			device.status === DeviceStatus.Connecting ||
			device.status === DeviceStatus.Loading ||
			device.modeChanging ||
			slotsStore.uploadingFromFile ||
			Object.values(slotsStore.slots).some((s) => s.loading),
	);
	const loadingMessage = computed(() => {
		if (device.status === DeviceStatus.Connecting) return 'Connecting...';
		if (device.status === DeviceStatus.Loading) return 'Loading patches...';
		if (device.modeChanging) return 'Loading performance...';
		if (slotsStore.uploadingFromFile) return 'Loading file...';
		return 'Loading patch...';
	});

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));
	const voiceModules = computed(() => slotsStore.getAreaModules(uiStore.slotInFocus, 1));
	const voiceCables = computed(() => slotsStore.getAreaCables(uiStore.slotInFocus, 1));
	const fxModules = computed(() => slotsStore.getAreaModules(uiStore.slotInFocus, 0));
	const fxCables = computed(() => slotsStore.getAreaCables(uiStore.slotInFocus, 0));
	const voiceSelectedModules = computed(() => (uiStore.selectedModulesArea === 'va' ? uiStore.selectedModules : []));
	const fxSelectedModules = computed(() => (uiStore.selectedModulesArea === 'fx' ? uiStore.selectedModules : []));
	const currentModules = computed(() => (uiStore.activeArea === 1 ? voiceModules.value : fxModules.value));
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

	const voiceOps = usePatchOperations(() => 'voice');
	const fxOps = usePatchOperations(() => 'fx');
	const { deleteSelection } = usePatchOperations();

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

	const showAboutDialog = ref(false);

	useElectronMenuActions({
		currentModules,
		currentPatch,
		handleSlotClick,
		handleVariationClick,
		showAbout: () => {
			showAboutDialog.value = true;
		},
	});
	useModuleKeyboard();

	async function handlePerfModeToggle(): Promise<void> {
		try {
			await device.togglePerfMode();
		} catch (e: any) {
			console.error('togglePerfMode failed:', e?.message ?? e);
		}
	}

	onMounted(async () => {
		const { version, platform } = await window.electronAPI.getAppInfo();
		console.log(`[startup] G2 Editor v${version} — ${platform}`);

		const isOffline = window.electronAPI.isOffline;
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
</script>
