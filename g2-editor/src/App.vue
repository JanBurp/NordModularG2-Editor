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
				<Button variant="toggle" :active="device.clockRunning" hint="clockRun" @click="device.setClockRunning(!device.clockRunning)">Run</Button>
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
				<Button variant="toggle" :active="device.device?.mode === 'Performance'" hint="perfMode" @click="handlePerfModeToggle($event)">Perf</Button>
				<DeviceSwitcher v-if="!isOfflineMode" />
			</template>

			<button
				class="status-badge ml-auto"
				:class="device.statusClass"
				data-testid="connection-status"
				@click="toggleConnection"
				@mouseenter="showHint('connectionToggle')"
				@mouseleave="clearHint"
			>
				<ConnectionDot :status="device.status" />
				<span>{{ device.statusLabel }}</span>
			</button>
		</ToolBar>

		<ExtendedToolBar
			v-if="settingsStore.toolbarMode !== 'hidden' && !uiStore.showBankOrganizer"
			:mode="settingsStore.toolbarMode === 'compact' ? 'compact' : 'classic'"
			@morph-group-label-edit="(info) => openMorphLabelDialog(info.groupIndex, info.currentLabel)"
		/>
		<PatchToolBar
			v-if="currentPatch && !uiStore.showBankOrganizer"
			:patch-name="patchName"
			:mode="settingsStore.toolbarMode === 'compact' ? 'compact' : 'classic'"
			@variation-click="handleVariationClick"
			@patch-name-click="() => openPatchNameDialog(patchName)"
		/>
		<ParameterPages v-if="currentPatch && !uiStore.showBankOrganizer && settingsStore.showParamPages && settingsStore.toolbarMode !== 'compact'" />
		<SearchReplaceBar v-if="currentPatch && !uiStore.showBankOrganizer && uiStore.showSearchReplace" />
		<ParamDragGhost />
		<KnobDragCursor />

		<div class="flex-1 flex overflow-hidden">
			<div
				ref="canvasAreaRef"
				class="flex-1 min-w-0 bg-surface-2 flex flex-col overflow-hidden transition-[filter]"
				:class="{ 'brightness-60': uiStore.mutatorFocused }"
			>
				<BankOrganizer v-if="uiStore.showBankOrganizer" />
				<!-- display:contents keeps the canvas layout; v-show (not v-if) keeps its zoom/scroll while the organizer is open -->
				<div v-if="currentPatch" v-show="!uiStore.showBankOrganizer" class="contents">
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
				</div>

				<VirtualKeyboard v-if="settingsStore.showVirtualKeyboard" class="mt-auto bg-surface-1 border-t border-line-subtle" />
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
			maxlength="7"
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
					<option v-for="l in storeInSynth.maxLocation.value" :key="l" :value="l">{{ storeInSynth.locationLabel(l) }}</option>
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
		:prevent-close="bankUpload.inProgress.value"
		@confirm="bankUpload.confirm"
		@cancel="bankUpload.cancel"
	>
		<div class="space-y-4">
			<div class="flex items-center gap-2" :class="{ 'opacity-50 pointer-events-none': bankUpload.locked.value }">
				<span class="text-sm text-content-secondary w-20">Type:</span>
				<BtnGroup
					:model-value="bankUpload.type.value"
					:options="BANK_TYPE_OPTIONS"
					stretch
					class="flex-1"
					@update:model-value="bankUpload.type.value = $event as 'patch' | 'performance'"
				/>
			</div>
			<div class="flex items-center gap-2" :class="{ 'opacity-50 pointer-events-none': bankUpload.locked.value }">
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
			<ProgressBar
				v-if="bankUpload.inProgress.value"
				:text="
					bankUpload.progress.value
						? `Uploading… location ${bankUpload.progress.value.location}/${bankUpload.progress.value.total} (${bankUpload.progress.value.written} written, ${bankUpload.progress.value.empty} empty)`
						: 'Uploading bank from G2...'
				"
				:value="bankUpload.progress.value?.location ?? 0"
				:max="bankUpload.progress.value?.total ?? 0"
				:detail="bankUpload.progress.value ? `${bankUpload.progress.value.location}: ${bankUpload.progress.value.name || '(empty)'}` : undefined"
			/>
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
		:prevent-close="bankDownload.inProgress.value"
		@confirm="bankDownload.confirm"
		@cancel="bankDownload.cancel"
	>
		<div class="space-y-4">
			<div v-if="bankDownload.showWarning.value" class="p-3 bg-red-500/20 border border-red-400 rounded text-red-400 text-sm text-center">
				<div><strong>WARNING:</strong> This will OVERWRITE the entire bank.</div>
			</div>
			<div class="flex items-center gap-2" :class="{ 'opacity-50 pointer-events-none': bankDownload.locked.value }">
				<span class="text-sm text-content-secondary w-20">Type:</span>
				<BtnGroup
					:model-value="bankDownload.type.value"
					:options="BANK_TYPE_OPTIONS"
					stretch
					class="flex-1"
					@update:model-value="bankDownload.type.value = $event as 'patch' | 'performance'"
				/>
			</div>
			<div class="flex items-center gap-2" :class="{ 'opacity-50 pointer-events-none': bankDownload.locked.value }">
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
				<ProgressBar
					v-else
					:text="
						bankDownload.progress.value
							? `Downloading… location ${bankDownload.progress.value.location}/${bankDownload.progress.value.total} (${bankDownload.progress.value.written} written, ${bankDownload.progress.value.cleared} cleared${bankDownload.progress.value.failed ? `, ${bankDownload.progress.value.failed} failed` : ''})`
							: 'Downloading bank to G2...'
					"
					:value="bankDownload.progress.value?.location ?? 0"
					:max="bankDownload.progress.value?.total ?? 0"
					:detail="
						bankDownload.progress.value ? `${bankDownload.progress.value.location}: ${bankDownload.progress.value.name || '(empty)'}` : undefined
					"
				/>
			</div>
			<div class="text-xs text-content-secondary">
				Download bank to synth memory.<br />Source can be a .pchList file or a folder patch files (max 128).
			</div>
		</div>
	</Dialog>

	<AboutDialog
		v-model="showAboutDialog"
		:closable="!startingUp"
		:connecting="startingUp"
		:connecting-message="loadingMessage"
		:progress="namesProgress"
		:message="aboutMessage"
		@update-available="onUpdateAvailable"
	/>

	<LoadingOverlay :show="isLoading" :message="loadingMessage" />

	<Dialog v-model="showDisconnected" title="G2 disconnected" :show-cancel="false">
		<div class="text-sm text-content-primary">Lost contact with the G2 — check the USB cable and power.</div>
		<div class="mt-2 text-xs text-content-secondary">The editor keeps your patches and sends them to the G2 again when it reconnects.</div>
	</Dialog>

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
	import BankOrganizer from './components/banks/BankOrganizer.vue';
	import ProgressBar from './components/common/ProgressBar.vue';
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
	import SearchReplaceBar from './components/toolbar/SearchReplaceBar.vue';
	import ParamDragGhost from './components/common/ParamDragGhost.vue';
	import KnobDragCursor from './components/common/KnobDragCursor.vue';
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
	import { useG2, namesLoadProgress } from './composables/useG2';
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
	import { useOrganizerHistoryStore } from './store/organizerHistory';
	import { useCableVisibility } from './composables/useCableVisibility';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { SlotLabel } from './store/slots';
	import { useBrowserStore } from './store/browser';
	import { useSettingsStore } from './store/settings';
	import { useConnectedDevicesStore } from './store/connectedDevices';
	import DeviceSwitcher from './components/toolbar/DeviceSwitcher.vue';
	import ConnectionDot from './components/common/ConnectionDot.vue';
	import { useStatusHint, holdHints, releaseHints } from './composables/useStatusHint';
	import { isMac } from './utils/platform';
	import { STATUS_HINTS } from './constants/statusHints';

	import { SLOT_LABELS, SLOT_OPTIONS, BANK_TYPE_OPTIONS, SOURCE_TYPE_OPTIONS } from './constants';

	const { state: ctxState, close: closeCtxMenu } = useContextMenu();
	const { state: modeDropdownState, close: closeModeDropdown, select: selectMode } = useModeDropdown();
	const { state: dsPresetDropdownState, close: closeDsPresetDropdown, select: selectDsPreset } = useDrumSynthPresetDropdown();
	const { toggleShowHideAll: toggleAllCables } = useCableVisibility();
	const { showHint, clearHint } = useStatusHint();

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();

	// Like the official editor's "lost contact" alert; closes by itself once the G2 is back.
	const showDisconnected = ref(false);
	watch(
		() => device.status,
		(status) => (showDisconnected.value = status === DeviceStatus.Lost),
	);
	// The Bank Organizer's undo steps describe this G2's banks: forget them once it is gone.
	const organizerHistory = useOrganizerHistoryStore();
	watch(
		() => device.status,
		(status) => {
			if (status === DeviceStatus.Lost || status === DeviceStatus.Disconnected) organizerHistory.clear();
		},
	);
	// Swallow every key while the performance is re-sent after a reconnect. Capture phase on window, registered before
	// any component's own listener, so no shortcut can edit a patch underneath the overlay.
	function blockKeysWhileResyncing(e: KeyboardEvent) {
		if (!device.resyncing) return;
		e.preventDefault();
		e.stopImmediatePropagation();
	}
	window.addEventListener('keydown', blockKeysWhileResyncing, true);
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
			(!startingUp.value || !showAboutDialog.value) &&
			(device.resyncing ||
				device.status === DeviceStatus.Connecting ||
				device.status === DeviceStatus.Loading ||
				device.modeChanging ||
				slotsStore.uploadingFromFile ||
				Object.values(slotsStore.slots).some((s) => s.loading)),
	);
	const aboutMessage = computed(() => {
		if (startingUp.value || device.status === DeviceStatus.Connected || device.status === DeviceStatus.Offline) return '';
		return device.status === DeviceStatus.DriverError ? 'USB driver error: the G2 could not be opened.' : 'G2 not connected.';
	});
	const loadingMessage = computed(() => {
		if (device.resyncing) return 'Reloading patches to G2...';
		if (namesLoadProgress.value) return `Loading banks ${namesLoadProgress.value.location}/${namesLoadProgress.value.total}...`;
		if (device.status === DeviceStatus.Connecting) return 'Connecting...';
		if (device.status === DeviceStatus.Loading) return 'Loading patches...';
		if (device.modeChanging) return 'Loading performance...';
		if (slotsStore.uploadingFromFile) return 'Loading file...';
		if (browserStore.loading) return 'Loading synth state...';
		return 'Loading patch...';
	});

	const namesProgress = computed(() => (namesLoadProgress.value ? namesLoadProgress.value.location / namesLoadProgress.value.total : undefined));

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

	const { connectDevice, toggleConnection, hardwareVariationChange, hardwareSlotChange } = useG2();

	const { handleSlotClick, handleSlotShiftClick, handleSlotCtrlClick, handleVariationClick, applySlotResult } = useSlotManagement(
		hardwareSlotChange,
		hardwareVariationChange,
	);

	// Mirrors handleSlotClick's own "can't focus an inactive slot while several are
	// active" guard (useSlotManagement.ts) so cycling only ever lands on a selectable slot.
	function cycleSlot(direction: 1 | -1): void {
		const slots = device.device?.slots;
		const activeCount = slots ? slots.filter((s) => s.active).length : 0;
		const selectable =
			slots && activeCount > 1
				? SLOT_LABELS.map((_, i) => i).filter((i) => slots.find((s) => s.slot === SLOT_LABELS[i])?.active)
				: SLOT_LABELS.map((_, i) => i);
		if (selectable.length === 0) return;
		const pos = selectable.indexOf(SLOT_LABELS.indexOf(uiStore.slotInFocus));
		const nextPos = pos === -1 ? 0 : (pos + direction + selectable.length) % selectable.length;
		handleSlotClick(selectable[nextPos]);
	}

	// Minimum time the startup splash stays up, so a fast connect doesn't flash it.
	const SPLASH_MIN_MS = 1000;
	const showAboutDialog = ref(false);
	const updateAvailable = ref(false);
	const startingUp = ref(true);

	function onUpdateAvailable() {
		updateAvailable.value = true;
		showAboutDialog.value = true; // check may finish after the splash already auto-closed
	}
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

		if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Tab') {
			e.preventDefault();
			cycleSlot(e.shiftKey ? -1 : 1);
			return;
		}

		// The menu's Zoom accelerators (CommandOrControl+= / -) don't match the numpad keys
		if ((e.ctrlKey || e.metaKey) && (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract')) {
			e.preventDefault();
			if (e.code === 'NumpadAdd') settingsStore.zoomIn();
			else settingsStore.zoomOut();
			return;
		}

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

		// Plain-key shortcuts must not hijack keys meant for a focused control or an open dialog
		const ownsKeys = el instanceof HTMLElement && el.closest('button, [role=slider], [role=menuitem], [role=option], [role=dialog]');
		if (noMod && !ownsKeys && !document.querySelector('[role=dialog]')) {
			switch (e.key) {
				case 'm':
					e.preventDefault();
					uiStore.showQuickAdd = true;
					return;
				case 'r':
					e.preventDefault();
					device.setClockRunning(!device.clockRunning);
					return;
				case 's':
					e.preventDefault();
					uiStore.shakeCables();
					return;
				case 'h':
					e.preventDefault();
					toggleAllCables();
					return;
				case ' ':
					e.preventDefault();
					if (e.shiftKey) uiStore.shakeCables();
					else if (uiStore.ghostCable && isGhostJack(uiStore.ghostCable.to)) cycleGhostCable();
					else toggleAllCables();
					return;
			}
		}
	}

	// macOS: ⌘-click (morph assign) and ⌘⌃-click (Ctrl-click = OS right-click) must not pop a context menu.
	function suppressCmdClickMenu(e: MouseEvent) {
		if (isMac && e.metaKey) {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	onMounted(() => {
		window.addEventListener('keydown', onGlobalKeydown);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mousedown', holdHints, true);
		window.addEventListener('mouseup', releaseHints, true);
		window.addEventListener('dragend', releaseHints, true); // native drags fire dragend, not mouseup
		window.addEventListener('contextmenu', suppressCmdClickMenu, true);
	});
	onUnmounted(() => {
		window.removeEventListener('keydown', onGlobalKeydown);
		window.removeEventListener('keydown', blockKeysWhileResyncing, true);
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mousedown', holdHints, true);
		window.removeEventListener('mouseup', releaseHints, true);
		window.removeEventListener('dragend', releaseHints, true);
		window.removeEventListener('contextmenu', suppressCmdClickMenu, true);
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

	async function handlePerfModeToggle(e: MouseEvent): Promise<void> {
		try {
			await device.togglePerfMode(e.shiftKey);
		} catch (e: any) {
			console.error('togglePerfMode failed:', e?.message ?? e);
		}
	}

	async function afterConnectRestoreFocus(): Promise<void> {
		if (device.status !== DeviceStatus.Connected) return;
		// The G2's focused slot, not the first keyed one: several slots can be keyed at once.
		const focusLabel = (device.device?.performance?.focus || 'A') as SlotLabel;
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
			// 0x58 always answers with the Patch page, 0x59 with the Global page. Ask for the Patch
			// page while still in Patch view; in Global source the 0x1E reply then flips the view
			// to Global and sets the Global page.
			uiStore.setGlobalPagesActive(false);
			await slotsStore.requestParamPage();
			if (device.device?.performance?.knobSourceGlobal) await slotsStore.requestGlobalParamPage();
		}
	}

	// Binds this window to a specific physical G2 (one BrowserWindow per device — see the
	// multi-device plan) before running the existing single-device connect flow unchanged.
	async function bindAndConnect(bus: number, deviceAddr: number): Promise<void> {
		// Set thisId from the already-known bus/device (same "${bus}:${device}" id main.ts
		// uses) before awaiting connect() — main.ts's devices:changed broadcast for this
		// window's own session can otherwise arrive first and briefly appear as an "other"
		// device in DeviceSwitcher while thisId is still null.
		connectedDevices.setThisId(`${bus}:${deviceAddr}`);
		await window.electronAPI.devices.connect(bus, deviceAddr);
		await connectDevice({ silent: showAboutDialog.value });
	}

	onMounted(async () => {
		try {
			await startup();
		} finally {
			startingUp.value = false;
		}
	});

	async function startup(): Promise<void> {
		const { version, platform } = await window.electronAPI.getAppInfo();
		console.log(`[startup] ${APP_NAME} v${version} — ${platform}`);

		if (isOfflineMode.value) {
			device.status = DeviceStatus.Offline;
			showAboutDialog.value = false;
			return;
		}

		const splashStart = Date.now();
		window.electronAPI.devices.onChanged((list) => connectedDevices.applyList(list));

		// A parallel-startup window is pre-assigned a specific device by the main process,
		// which also decides showSplash there (synchronously, in creation order) — not left to
		// whichever window's onMounted happens to run first, which would be a real race between
		// independent renderer processes. A window with no assignment (the single-window
		// fallback when no devices were found at launch) falls back to claimStartupSplash().
		const assignment = await window.electronAPI.devices.getAssignment();
		if (assignment) {
			showAboutDialog.value = assignment.showSplash;
			await bindAndConnect(assignment.bus, assignment.device);
		} else {
			showAboutDialog.value = await window.electronAPI.claimStartupSplash();
			const found = await window.electronAPI.devices.list();
			const unclaimed = found.filter((d) => !d.alreadyConnected);
			if (unclaimed.length > 0) await bindAndConnect(unclaimed[0].bus, unclaimed[0].device);
			else await connectDevice({ silent: showAboutDialog.value });
		}

		await afterConnectRestoreFocus();
		// Keep the splash open on a failed connect so the user sees why (message + Close in AboutDialog).
		if (device.status === DeviceStatus.Connected) {
			const remaining = SPLASH_MIN_MS - (Date.now() - splashStart);
			if (showAboutDialog.value && remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
			if (!updateAvailable.value) showAboutDialog.value = false;
		}
	}
</script>
