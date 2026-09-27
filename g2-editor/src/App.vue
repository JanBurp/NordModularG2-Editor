<template>
	<svg style="position: absolute; width: 0; height: 0; overflow: hidden" aria-hidden="true">
		<SvgGradientDefs />
	</svg>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel class="w-10">Perf:</ToolBarLabel>
				<ToolBarText class="w-36 cursor-pointer" hint="renamePerf" @click="openPerfNameDialog">{{ device.perfName }}</ToolBarText>
				<ToolBarLabel>Clk:</ToolBarLabel>
				<ToolBarText class="w-13 cursor-pointer hover:text-input" hint="setBpm" @click="openBpmDialog">{{ device.bpm }}</ToolBarText>
				<Button variant="toggle" :active="device.clockRunning" @click="device.setClockRunning(!device.clockRunning)">Run</Button>
				<ToolBarDivider />
				<BtnGroup
					:model-value="uiStore.selectedSlotIndex"
					:options="SLOT_OPTIONS"
					:top-indicators="device.getSlotsKeyStatus"
					:bottom-indicators="device.getSlotsActiveStatus"
					testIdPrefix="slot"
					@update:model-value="handleSlotClick"
					@shift-click="handleSlotShiftClick"
					@ctrl-click="handleSlotCtrlClick"
				/>
				<ToolBarDivider />
				<ToolBarText class="w-32">{{ device.device?.synthName || '---' }}</ToolBarText>
				<Button variant="toggle" :active="device.device?.mode === 'Performance'" @click="handlePerfModeToggle()">Perf</Button>
			</template>

			<button
				class="status-badge ml-auto"
				:class="device.statusClass"
				data-testid="connection-status"
				@click="toggleConnection"
				@mouseenter="showHint('connectionToggle')"
				@mouseleave="clearHint"
			>
				<span class="status-dot" :class="device.dotClass" />
				<span>{{ device.statusLabel }}</span>
			</button>

			<DeviceSwitcher v-if="!isOfflineMode" />
		</ToolBar>

		<ExtendedToolBar
			v-if="settingsStore.toolbarMode !== 'hidden'"
			:mode="settingsStore.toolbarMode === 'compact' ? 'compact' : 'classic'"
			@morph-group-label-edit="(info) => openMorphLabelDialog(info.groupIndex, info.currentLabel)"
		/>
		<PatchToolBar
			v-if="currentPatch"
			:patch-name="patchName"
			:mode="settingsStore.toolbarMode === 'compact' ? 'compact' : 'classic'"
			@variation-click="handleVariationClick"
			@patch-name-click="() => openPatchNameDialog(patchName)"
		/>
		<ParameterPages v-if="currentPatch && settingsStore.showParamPages && settingsStore.toolbarMode !== 'compact'" />
		<ParamDragGhost />

		<div class="flex-1 flex overflow-hidden">
			<div ref="canvasAreaRef" class="flex-1 min-w-0 bg-surface-2 flex flex-col overflow-hidden">
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
							@jack-drag-start="(info) => onJackDragStart(info, 1)"
							@jack-drag-end="(info) => jackPatching.handleJackDragEnd({ ...info, area: 1 })"
							@module-move="voiceOps.handleModuleMove"
							@module-drop="voiceOps.handleModuleDrop"
							@mode-change="voiceOps.handleModeChange"
							@param-change="voiceOps.handleParamChange"
							@module-label-edit="(info) => handleModuleLabelEdit({ ...info, area: 'voice' })"
							@module-delete="voiceOps.handleModuleDelete"
							@module-paste-params="voiceOps.handlePasteParams"
							@module-color-change="voiceOps.handleModuleColorChange"
							@module-replace="voiceOps.handleModuleReplace"
							@jack-delete-connected="voiceOps.handleJackDeleteConnected"
							@jack-break-connection="voiceOps.handleJackBreakConnection"
							@jack-set-cable-color="voiceOps.handleJackSetCableColor"
							@cable-group-drop="(info) => voiceOps.handleCableGroupDrop(info.group, info.fromJack, info.toJack)"
							@param-label-edit="(info) => handleParamLabelEdit({ ...info, area: 'voice' })"
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
							@jack-drag-start="(info) => onJackDragStart(info, 0)"
							@jack-drag-end="(info) => jackPatching.handleJackDragEnd({ ...info, area: 0 })"
							@module-move="fxOps.handleModuleMove"
							@module-drop="fxOps.handleModuleDrop"
							@mode-change="fxOps.handleModeChange"
							@param-change="fxOps.handleParamChange"
							@module-label-edit="(info) => handleModuleLabelEdit({ ...info, area: 'fx' })"
							@module-delete="fxOps.handleModuleDelete"
							@module-paste-params="fxOps.handlePasteParams"
							@module-color-change="fxOps.handleModuleColorChange"
							@module-replace="fxOps.handleModuleReplace"
							@jack-delete-connected="fxOps.handleJackDeleteConnected"
							@jack-break-connection="fxOps.handleJackBreakConnection"
							@jack-set-cable-color="fxOps.handleJackSetCableColor"
							@cable-group-drop="(info) => fxOps.handleCableGroupDrop(info.group, info.fromJack, info.toJack)"
							@param-label-edit="(info) => handleParamLabelEdit({ ...info, area: 'fx' })"
						/>
					</div>
				</template>

				<VirtualKeyboard v-if="settingsStore.showVirtualKeyboard" class="mt-auto" />
			</div>

			<SidePanel v-if="settingsStore.showRightPane" />
		</div>

		<StatusBar />

		<SvgViewer v-if="uiStore.showSvgViewer" />
	</div>

	<Dialog v-model="showParamLabelDialog" title="Rename Label" confirm-label="Rename" @confirm="confirmParamLabel" @cancel="showParamLabelDialog = false">
		<input
			v-model="editingParamLabel"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showLabelDialog" title="Rename Module" confirm-label="Rename" @confirm="confirmModuleLabel" @cancel="showLabelDialog = false">
		<input
			v-model="editingLabel"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showPatchNameDialog" title="Rename Patch" confirm-label="Rename" @confirm="confirmPatchName" @cancel="cancelPatchNameDialog">
		<input
			v-model="editingPatchName"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showPerfNameDialog" title="Rename Performance" confirm-label="Rename" @confirm="confirmPerfName" @cancel="cancelPerfNameDialog">
		<input
			v-model="editingPerfName"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
			maxlength="16"
		/>
	</Dialog>

	<Dialog v-model="showMorphLabelDialog" title="Rename Morph Group" confirm-label="Rename" @confirm="confirmMorphLabel" @cancel="cancelMorphLabel">
		<input
			v-model="editingMorphLabel"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
			maxlength="7"
		/>
	</Dialog>

	<Dialog v-model="showBpmDialog" title="Set BPM" confirm-label="Set" @confirm="confirmBpm" @cancel="cancelBpmDialog">
		<input
			v-model.number="editingBpm"
			type="number"
			min="30"
			max="240"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
		/>
	</Dialog>

	<Dialog v-model="showDevicePickerDialog" title="Select G2 Device" :show-confirm="false" @cancel="cancelDevicePicker">
		<div class="text-sm text-content-primary mb-2">Multiple Nord Modular G2 units are connected. Choose which one to edit in this window.</div>
		<div class="flex flex-col gap-2">
			<button
				v-for="c in deviceCandidates"
				:key="c.id"
				class="px-3 py-2 text-sm text-left rounded bg-surface-2 hover:bg-surface-3 text-content-primary"
				@click="selectDeviceCandidate(c)"
			>
				{{ c.name ?? `bus ${c.bus}, device ${c.device}` }}
			</button>
		</div>
	</Dialog>

	<Dialog v-model="downloadToSlot.showDialog.value" title="Download to Slot" :show-confirm="false" @cancel="downloadToSlot.cancel">
		<div class="text-sm text-content-primary mb-2">Download the current patch to a slot in the connected synth.</div>
		<div class="flex flex-col gap-2">
			<div v-for="s in downloadToSlot.slotOptions" :key="s" class="flex items-center gap-2">
				<Button variant="default" :disabled="s === downloadToSlot.currentSlot.value" class="w-20" @click="downloadToSlot.selectSlot(s)">
					Slot {{ s }}
				</Button>
				<span class="text-sm text-content-secondary truncate">{{ downloadToSlot.slotNames.value[s] }}</span>
			</div>
		</div>
	</Dialog>

	<Dialog v-model="storeInSynth.showDialog.value" title="Save in Synth" confirm-label="Save" @confirm="storeInSynth.confirm" @cancel="storeInSynth.cancel">
		<div class="text-sm text-content-primary mb-2">Save the {{ storeInSynth.kind.value }} at a synthesizer memory location.</div>
		<div class="flex gap-2">
			<div class="flex-1">
				<label class="text-content-secondary text-xs">Bank</label>
				<select
					v-model.number="storeInSynth.bank.value"
					class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
				>
					<option v-for="b in storeInSynth.maxBank.value" :key="b" :value="b">{{ b }}</option>
				</select>
			</div>
			<div class="flex-1">
				<label class="text-content-secondary text-xs">Location</label>
				<select
					v-model.number="storeInSynth.location.value"
					class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
				>
					<option v-for="l in storeInSynth.maxLocation.value" :key="l" :value="l">{{ l }}</option>
				</select>
			</div>
		</div>
	</Dialog>

	<Dialog
		v-model="bankUpload.showDialog.value"
		title="Bank Upload (from G2)"
		confirm-label="Upload"
		:close-on-confirm="false"
		:disable-confirm="bankUpload.inProgress.value"
		@confirm="bankUpload.confirm"
		@cancel="bankUpload.cancel"
	>
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Type:</span>
				<BtnGroup
					:model-value="bankUpload.type.value"
					:options="BANK_TYPE_OPTIONS"
					stretch
					class="flex-1"
					@update:model-value="bankUpload.type.value = $event as 'patch' | 'performance'"
				/>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Bank:</span>
				<select
					v-model="bankUpload.bankNum.value"
					:disabled="bankUpload.inProgress.value"
					class="flex-1 px-2 py-1 text-sm bg-surface-2 rounded border border-line-default text-content-primary"
				>
					<option v-for="n in bankUpload.bankOptions.value" :key="n" :value="n">{{ n }}</option>
				</select>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Folder:</span>
				<div class="flex-1 flex items-center gap-1">
					<input
						v-model="bankUpload.folder.value"
						:disabled="bankUpload.inProgress.value"
						class="flex-1 px-2 py-1 text-sm bg-surface-2 rounded border border-line-default text-content-primary"
						readonly
						placeholder="Select folder..."
					/>
					<button
						class="px-2 py-1 text-xs bg-surface-3 rounded hover:bg-surface-4 disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="bankUpload.inProgress.value"
						@click="bankUpload.selectFolder"
					>
						Browse...
					</button>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Name:</span>
				<input
					v-model="bankUpload.filename.value"
					:disabled="bankUpload.inProgress.value"
					class="flex-1 px-2 py-1 text-sm bg-surface-2 rounded border border-line-default text-content-primary"
					placeholder="(optional)"
				/>
			</div>
			<div v-if="bankUpload.inProgress.value" class="space-y-1">
				<div class="text-orange-400 text-sm">
					{{
						bankUpload.progress.value
							? `Uploading… location ${bankUpload.progress.value.location}/${bankUpload.progress.value.total} (${bankUpload.progress.value.written} written, ${bankUpload.progress.value.empty} empty)`
							: 'Uploading bank from G2...'
					}}
				</div>
				<div class="h-1.5 w-full bg-surface-2 rounded overflow-hidden">
					<div
						class="h-full bg-orange-400 transition-all"
						:style="{
							width: bankUpload.progress.value ? `${(bankUpload.progress.value.location / bankUpload.progress.value.total) * 100}%` : '0%',
						}"
					></div>
				</div>
				<div v-if="bankUpload.progress.value" class="text-xs text-content-secondary truncate">
					{{ `${bankUpload.progress.value.location}: ${bankUpload.progress.value.name || '(empty)'}` }}
				</div>
			</div>
			<div class="text-xs text-content-secondary">
				Save complete {{ bankUpload.type.value }} bank from synth memory to disk.<br />Creates individual sound files + .pchList file.
			</div>
		</div>
	</Dialog>

	<Dialog
		v-model="bankDownload.showDialog.value"
		title="Bank Download (to G2)"
		confirm-label="Download"
		:close-on-confirm="false"
		:disable-confirm="bankDownload.inProgress.value"
		@confirm="bankDownload.confirm"
		@cancel="bankDownload.cancel"
	>
		<div class="space-y-4">
			<div v-if="bankDownload.showWarning.value" class="p-3 bg-red-500/20 border border-red-400 rounded text-red-400 text-sm text-center">
				<div><strong>WARNING:</strong> This will OVERWRITE the entire bank.</div>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Type:</span>
				<BtnGroup
					:model-value="bankDownload.type.value"
					:options="BANK_TYPE_OPTIONS"
					stretch
					class="flex-1"
					@update:model-value="bankDownload.type.value = $event as 'patch' | 'performance'"
				/>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Bank:</span>
				<select
					v-model="bankDownload.bankNum.value"
					:disabled="bankDownload.inProgress.value"
					class="flex-1 px-2 py-1 text-sm bg-surface-2 rounded border border-line-default text-content-primary"
				>
					<option v-for="n in bankDownload.bankOptions.value" :key="n" :value="n">{{ n }}</option>
				</select>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Type:</span>
				<div class="flex-1 flex items-center gap-2">
					<BtnGroup
						:model-value="bankDownload.sourceType.value"
						:options="SOURCE_TYPE_OPTIONS"
						class="whitespace-nowrap"
						@update:model-value="bankDownload.setSourceType($event as 'pchList' | 'folder')"
					/>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm text-content-secondary w-20">Source:</span>
				<div class="flex gap-2">
					<input
						v-model="bankDownload.sourcePath.value"
						:disabled="bankDownload.inProgress.value"
						class="flex-1 px-2 py-1 text-sm bg-surface-2 rounded border border-line-default text-content-primary"
						readonly
						:placeholder="bankDownload.sourceType.value === 'pchList' ? 'Select .pchList file...' : 'Select folder...'"
					/>
					<button
						class="px-2 py-1 text-xs bg-surface-3 rounded hover:bg-surface-4 disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="bankDownload.inProgress.value"
						@click="bankDownload.selectSource"
					>
						Browse...
					</button>
				</div>
			</div>
			<div v-if="bankDownload.inProgress.value" class="space-y-1">
				<div v-if="bankDownload.reloadingNames.value" class="text-orange-400 text-sm">Reloading patch/performance names from G2…</div>
				<template v-else>
					<div class="text-orange-400 text-sm">
						{{
							bankDownload.progress.value
								? `Downloading… location ${bankDownload.progress.value.location}/${bankDownload.progress.value.total} (${bankDownload.progress.value.written} written, ${bankDownload.progress.value.cleared} cleared${bankDownload.progress.value.failed ? `, ${bankDownload.progress.value.failed} failed` : ''})`
								: 'Downloading bank to G2...'
						}}
					</div>
					<div class="h-1.5 w-full bg-surface-2 rounded overflow-hidden">
						<div
							class="h-full bg-orange-400 transition-all"
							:style="{
								width: bankDownload.progress.value
									? `${(bankDownload.progress.value.location / bankDownload.progress.value.total) * 100}%`
									: '0%',
							}"
						></div>
					</div>
					<div v-if="bankDownload.progress.value" class="text-xs text-content-secondary truncate">
						{{ `${bankDownload.progress.value.location}: ${bankDownload.progress.value.name || '(empty)'}` }}
					</div>
				</template>
			</div>
			<div class="text-xs text-content-secondary">
				Download bank to synth memory.<br />Source can be a .pchList file or a folder patch files (max 128).
			</div>
		</div>
	</Dialog>

	<AboutDialog v-model="showAboutDialog" :closable="!startingUp" :connecting="startingUp" :connecting-message="loadingMessage" />

	<LoadingOverlay :show="isLoading" :message="loadingMessage" />

	<DriverErrorDialog @retry="toggleConnection" />

	<ParamEditDialog />

	<ContextMenu v-if="ctxState.visible" :items="ctxState.items" :x="ctxState.x" :y="ctxState.y" @close="closeCtxMenu" />

	<ModuleModeDropdown
		v-if="modeDropdownState.visible && modeDropdownState.paramDef"
		:param-def="modeDropdownState.paramDef"
		:value="modeDropdownState.value"
		:x="modeDropdownState.x"
		:y="modeDropdownState.y"
		:module-id="modeDropdownState.moduleId"
		:lv="modeDropdownState.lv"
		@select="selectMode"
		@close="closeModeDropdown"
	/>

	<DrumSynthPresetDropdown
		v-if="dsPresetDropdownState.visible"
		:x="dsPresetDropdownState.x"
		:y="dsPresetDropdownState.y"
		:selected-index="dsPresetDropdownState.selectedIndex"
		@select="selectDsPreset"
		@close="closeDsPresetDropdown"
	/>

	<QuickAddModule v-if="uiStore.showQuickAdd" :x="quickAddPos.x" :y="quickAddPos.y" @close="uiStore.showQuickAdd = false" />

	<KeyCommandsPage v-if="uiStore.showKeyCommandsPage" @close="uiStore.showKeyCommandsPage = false" />

	<Toast />
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
	import PatchCanvas from './components/canvas/PatchCanvas.vue';
	import SidePanel from './components/panels/SidePanel.vue';
	import Button from './components/toolbar/Button.vue';
	import BtnGroup from './components/toolbar/BtnGroup.vue';
	import ToolBar from './components/toolbar/ToolBar.vue';
	import ToolBarLabel from './components/toolbar/ToolBarLabel.vue';
	import ToolBarText from './components/toolbar/ToolBarText.vue';
	import ToolBarDivider from './components/toolbar/ToolBarDivider.vue';
	import ExtendedToolBar from './components/toolbar/ExtendedToolBar.vue';
	import PatchToolBar from './components/toolbar/PatchToolBar.vue';
	import ParameterPages from './components/toolbar/ParameterPages.vue';
	import ParamDragGhost from './components/common/ParamDragGhost.vue';
	import StatusBar from './components/toolbar/StatusBar.vue';
	import VirtualKeyboard from './components/toolbar/VirtualKeyboard.vue';
	import Dialog from './components/common/Dialog.vue';
	import LoadingOverlay from './components/common/LoadingOverlay.vue';
	import ContextMenu from './components/common/ContextMenu.vue';
	import { useContextMenu } from './composables/useContextMenu';
	import ModuleModeDropdown from './components/canvas/ModuleModeDropdown.vue';
	import { useModeDropdown } from './composables/useModeDropdown';
	import DrumSynthPresetDropdown from './components/canvas/DrumSynthPresetDropdown.vue';
	import { useDrumSynthPresetDropdown } from './composables/useDrumSynthPresetDropdown';
	import SvgGradientDefs from './components/canvas/SvgGradientDefs.vue';
	import SvgViewer from './components/canvas/SvgViewer.vue';

	import { useAreaMode } from './composables/useAreaMode';
	import { useG2 } from './composables/useG2';
	import { useJackPatching } from './composables/useJackPatching';
	import { useGhostCable, isGhostJack } from './composables/useGhostCable';
	import { commitClickModeSnap } from './composables/useJackDragInteraction';
	import type { JackDragInfo } from './types';
	import { useModuleLabelDialog } from './composables/useModuleLabelDialog';
	import { useMorphLabelDialog } from './composables/useMorphLabelDialog';
	import { usePatchOperations } from './composables/usePatchOperations';
	import { usePatchNameDialog } from './composables/usePatchNameDialog';
	import { usePerfNameDialog } from './composables/usePerfNameDialog';
	import { useBpmDialog } from './composables/useBpmDialog';
	import { useBankDownloadDialog } from './composables/useBankDownloadDialog';
	import { useBankUploadDialog } from './composables/useBankUploadDialog';
	import { useDownloadToSlotDialog } from './composables/useDownloadToSlotDialog';
	import { useStoreInSynthDialog } from './composables/useStoreInSynthDialog';
	import { useSlotManagement } from './composables/useSlotManagement';
	import { useElectronMenuActions } from './composables/useElectronMenuActions';
	import { useModuleKeyboard } from './composables/useModuleKeyboard';
	import { useWindowTitle } from './composables/useWindowTitle';
	import { APP_NAME } from '@/constants';
	import ParamEditDialog from './components/common/ParamEditDialog.vue';
	import AboutDialog from './components/common/AboutDialog.vue';
	import DriverErrorDialog from './components/common/DriverErrorDialog.vue';
	import QuickAddModule from './components/common/QuickAddModule.vue';
	import KeyCommandsPage from './components/common/KeyCommandsPage.vue';
	import Toast from './components/common/Toast.vue';
	import { DeviceStatus, useDeviceStore } from './store/device';
	import { useCableVisibility } from './composables/useCableVisibility';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { SlotLabel } from './store/slots';
	import { useBrowserStore } from './store/browser';
	import { useSettingsStore } from './store/settings';
	import { useConnectedDevicesStore } from './store/connectedDevices';
	import DeviceSwitcher from './components/toolbar/DeviceSwitcher.vue';
	import { useStatusHint } from './composables/useStatusHint';
	import { STATUS_HINTS } from './constants/statusHints';

	import { SLOT_LABELS, SLOT_OPTIONS, BANK_TYPE_OPTIONS, SOURCE_TYPE_OPTIONS } from './constants';

	const { state: ctxState, close: closeCtxMenu } = useContextMenu();
	const { state: modeDropdownState, close: closeModeDropdown, select: selectMode } = useModeDropdown();
	const { state: dsPresetDropdownState, close: closeDsPresetDropdown, select: selectDsPreset } = useDrumSynthPresetDropdown();
	const { toggleShowHideAll: toggleAllCables } = useCableVisibility();
	const { showHint, clearHint } = useStatusHint();

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const browserStore = useBrowserStore();
	const settingsStore = useSettingsStore();
	const connectedDevices = useConnectedDevicesStore();
	const isOfflineMode = computed(() => window.electronAPI?.isOffline ?? false);
	const jackPatching = useJackPatching();
	const { clearGhostCable, cycleGhostCable, confirmGhostCable } = useGhostCable();

	watch(
		() => uiStore.ghostCable,
		(ghost) => {
			if (ghost && isGhostJack(ghost.to)) showHint('ghostCable');
			else if (uiStore.statusHint === STATUS_HINTS.ghostCable) clearHint();
		},
	);

	function onJackDragStart(info: JackDragInfo, area: 0 | 1) {
		if (settingsStore.cableConnectMode === 'click') jackPatching.armOrConnect({ ...info, area });
		else jackPatching.handleJackDragStart({ ...info, area });
	}

	const canvasAreaRef = ref<HTMLElement | null>(null);
	const { isSplit, showVoice, showFx, voiceWrapperStyle, startDividerDrag } = useAreaMode(canvasAreaRef);

	const isLoading = computed(
		() =>
			!startingUp.value &&
			(device.status === DeviceStatus.Connecting ||
				device.status === DeviceStatus.Loading ||
				device.modeChanging ||
				slotsStore.uploadingFromFile ||
				Object.values(slotsStore.slots).some((s) => s.loading)),
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

	const { showMorphLabelDialog, editingMorphLabel, openMorphLabelDialog, confirmMorphLabel, cancelMorphLabel } = useMorphLabelDialog();

	const { showDialog: showBpmDialog, editingBpm, open: openBpmDialog, confirm: confirmBpm, cancel: cancelBpmDialog } = useBpmDialog();

	const bankUpload = useBankUploadDialog();
	const bankDownload = useBankDownloadDialog();
	const downloadToSlot = useDownloadToSlotDialog();
	const storeInSynth = useStoreInSynthDialog();

	const { connectDevice, toggleConnection, hardwareVariationChange, hardwareSlotChange, requestKeyFocus } = useG2();

	const { handleSlotClick, handleSlotShiftClick, handleSlotCtrlClick, handleVariationClick, applySlotResult } = useSlotManagement(
		hardwareSlotChange,
		hardwareVariationChange,
		requestKeyFocus,
	);

	const showAboutDialog = ref(true);
	const startingUp = ref(true);
	const quickAddPos = ref({ x: 0, y: 0 });

	function onMouseMove(e: MouseEvent) {
		quickAddPos.value = { x: e.clientX, y: e.clientY };
	}

	function onGlobalKeydown(e: KeyboardEvent) {
		if (uiStore.showKeyCommandsPage) {
			if (e.key === 'Escape') uiStore.showKeyCommandsPage = false;
			return;
		}
		if (uiStore.showQuickAdd) return;

		const el = document.activeElement;
		const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
		const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

		if (isInput) return;

		if (e.key === 'Escape') {
			jackPatching.clearArmed();
			clearGhostCable();
		}

		if (e.key === 'Enter') {
			if (uiStore.armedJack) {
				e.preventDefault();
				commitClickModeSnap();
			} else if (uiStore.ghostCable) {
				e.preventDefault();
				confirmGhostCable();
			}
		}

		if (noMod) {
			switch (e.key) {
				case 'm':
					e.preventDefault();
					uiStore.showQuickAdd = true;
					return;
				case 'r':
					e.preventDefault();
					device.setClockRunning(!device.clockRunning);
					return;
				case ' ':
					e.preventDefault();
					if (uiStore.ghostCable && isGhostJack(uiStore.ghostCable.to)) cycleGhostCable();
					else toggleAllCables();
					return;
			}
		}

		if (e.key === ' ' && e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			uiStore.shakeCables();
		}
	}

	onMounted(() => {
		window.addEventListener('keydown', onGlobalKeydown);
		window.addEventListener('mousemove', onMouseMove);
	});
	onUnmounted(() => {
		window.removeEventListener('keydown', onGlobalKeydown);
		window.removeEventListener('mousemove', onMouseMove);
		if (!isOfflineMode.value) window.electronAPI?.devices?.offChanged();
	});

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
	useWindowTitle();

	async function handlePerfModeToggle(): Promise<void> {
		try {
			await device.togglePerfMode();
		} catch (e: any) {
			console.error('togglePerfMode failed:', e?.message ?? e);
		}
	}

	const showDevicePickerDialog = ref(false);
	const deviceCandidates = ref<{ bus: number; device: number; id: string; name: string | null }[]>([]);

	async function afterConnectRestoreFocus(): Promise<void> {
		if (device.status !== DeviceStatus.Connected) return;
		const focusedEntry = device.device?.slots?.find((s) => s.key);
		const focusLabel = (focusedEntry?.slot ?? 'A') as SlotLabel;
		const idx = SLOT_LABELS.indexOf(focusLabel);
		if (idx >= 0) {
			const slot = SLOT_LABELS[idx];
			uiStore.setSlotInFocus(slot);
			const slotEntry = slotsStore.slots[slot];
			if (slotEntry.patch) {
				applySlotResult({ patch: slotEntry.patch, name: slotEntry.name });
			} else {
				applySlotResult(await slotsStore.loadSlot(slot));
			}
		}
		if (!browserStore.synthPatches.length) {
			browserStore.loadSynthList();
		}
	}

	// Binds this window to a specific physical G2 (one BrowserWindow per device — see the
	// multi-device plan) before running the existing single-device connect flow unchanged.
	async function bindAndConnect(bus: number, deviceAddr: number): Promise<void> {
		const { id } = await window.electronAPI.devices.connect(bus, deviceAddr);
		connectedDevices.setThisId(id);
		await connectDevice();
	}

	async function selectDeviceCandidate(c: { bus: number; device: number }): Promise<void> {
		showDevicePickerDialog.value = false;
		await bindAndConnect(c.bus, c.device);
		await afterConnectRestoreFocus();
		startingUp.value = false;
	}

	function cancelDevicePicker(): void {
		showDevicePickerDialog.value = false;
		device.status = DeviceStatus.Disconnected;
		startingUp.value = false;
	}

	onMounted(async () => {
		const { version, platform } = await window.electronAPI.getAppInfo();
		console.log(`[startup] ${APP_NAME} v${version} — ${platform}`);

		if (isOfflineMode.value) {
			device.status = DeviceStatus.Offline;
			showAboutDialog.value = false;
			startingUp.value = false;
			return;
		}

		window.electronAPI.devices.onChanged((list) => connectedDevices.applyList(list));

		const found = await window.electronAPI.devices.list();
		const unclaimed = found.filter((d) => !d.alreadyConnected);
		if (unclaimed.length <= 1) {
			// Zero found: fall through to today's existing "not found" behavior unchanged.
			// Exactly one found: bind it to this window automatically — preserves today's
			// zero-click UX for the common single-G2 case.
			if (unclaimed.length === 1) await bindAndConnect(unclaimed[0].bus, unclaimed[0].device);
			else await connectDevice();
		} else {
			deviceCandidates.value = unclaimed.map((d) => ({ ...d, name: null }));
			showDevicePickerDialog.value = true;
			unclaimed.forEach(async (d, i) => {
				const name = await window.electronAPI.devices.getName(d.bus, d.device);
				const entry = deviceCandidates.value[i];
				if (entry) entry.name = name;
			});
			showAboutDialog.value = false;
			return; // startingUp/focus-restore resume in selectDeviceCandidate() once the user picks one
		}

		await afterConnectRestoreFocus();
		showAboutDialog.value = false;
		startingUp.value = false;
	});
</script>
