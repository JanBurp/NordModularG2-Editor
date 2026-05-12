<template>
	<svg style="position: absolute; width: 0; height: 0; overflow: hidden" aria-hidden="true">
		<SvgGradientDefs />
	</svg>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel class="w-10">Perf:</ToolBarLabel>
				<ToolBarText class="w-36">{{ device.perfName }}</ToolBarText>
				<ToolBarLabel>Clk:</ToolBarLabel>
				<ToolBarText class="w-10">{{ device.bpm }}</ToolBarText>
				<Button variant="toggle"><span v-if="device.clockRunning">Run</span><span v-else>Stop</span></Button>
				<ToolBarText class="w-32">{{ device.deviceName }}</ToolBarText>
				<BtnGroup :model-value="uiStore.selectedSlotIndex" :options="SLOT_OPTIONS" variant="toggle" @update:model-value="handleSlotClick" />
			</template>

			<ToolBarDivider />

			<BtnGroup
				class="ml-auto"
				:model-value="uiStore.rightPaneTab"
				:options="PANE_TAB_OPTIONS"
				variant="tab"
				@update:model-value="(tab) => uiStore.toggleSidebar(tab as PaneTab)"
				@toggle-off="(tab) => uiStore.toggleSidebar(tab as PaneTab)"
			/>
		</ToolBar>

		<ToolBar v-if="patchName">
			<ToolBarLabel class="w-10">Patch:</ToolBarLabel>
			<ToolBarText class="w-36">{{ patchName }}</ToolBarText>

			<div class="flex items-center gap-1.5">
				<ToolBarLabel>Cat:</ToolBarLabel>
				<select
					v-model="selectedCategory"
					class="h-8 px-2 text-xs border border-neutral-500 rounded bg-gray-300 text-gray-800 cursor-pointer min-w-24 hover:bg-gray-200 focus:outline-none focus:border-neutral-600 focus:shadow"
					title="Sound Category"
				>
					<option v-for="cat in soundCategories" :key="cat.id" :value="cat.id">
						{{ cat.name }}
					</option>
				</select>
			</div>

			<ToolBarDivider />

			<div class="flex items-center gap-2">
				<BtnGroup v-model="uiStore.variation" :options="VARIATION_OPTIONS" variant="variation" @update:model-value="handleVariationClick" />
			</div>

			<ToolBarDivider />

			<ColorPicker />

			<ToolBarDivider />

			<CableVisibilitySelector />
		</ToolBar>

		<div class="flex-1 flex overflow-hidden">
			<div class="flex-1 overflow-auto bg-neutral-900 relative">
				<template v-if="currentPatch">
					<PatchCanvas
						v-show="uiStore.area === 1"
						:key="patchName + '-voice'"
						:modules="voiceModules"
						:cables="voiceCables"
						:variation="uiStore.variation"
						area="voice"
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

		<StatusBar @toggle-connection="toggleConnection" />

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

	<ContextMenu v-if="ctxState.visible" :items="ctxState.items" :x="ctxState.x" :y="ctxState.y" @close="closeCtxMenu" />
</template>

<script setup lang="ts">
	import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
	import type { Cable } from './renderer/cableRenderer';
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
	import StatusBar from './components/toolbar/StatusBar.vue';
	import ColorPicker from './components/common/ColorPicker.vue';
	import Dialog from './components/common/Dialog.vue';
	import ContextMenu from './components/common/ContextMenu.vue';
	import { useContextMenu } from './composables/useContextMenu';
	import SvgGradientDefs from './components/canvas/SvgGradientDefs.vue';
	import SvgViewer from './components/canvas/SvgViewer.vue';

	import { useG2 } from './composables/useG2';
	import { useJackPatching } from './composables/useJackPatching';
	import { usePatchFile } from './composables/usePatchFile';
	import { useDeviceStore } from './store/device';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { PaneTab } from './store/ui';
	import type { SlotLabel } from './store/slots';
	import { usePatchCategory } from './composables/usePatchCategory';
	import { useBrowserStore } from './store/browser';

	import { SOUND_CATEGORIES as soundCategories, SLOT_LABELS, SLOT_OPTIONS, PANE_TAB_OPTIONS, AREA_OPTIONS, VARIATION_OPTIONS } from './constants';
	import SettingsPane from './components/panels/SettingsPane.vue';
	import CableVisibilitySelector from './components/toolbar/CableVisibilitySelector.vue';

	const { state: ctxState, close: closeCtxMenu } = useContextMenu();

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const browserStore = useBrowserStore();
	const jackPatching = useJackPatching();
	const patchFile = usePatchFile();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.activeSlot));
	const voiceModules = computed(() => slotsStore.getAreaModules(uiStore.activeSlot, 1));
	const voiceCables = computed(() => slotsStore.getAreaCables(uiStore.activeSlot, 1));
	const fxModules = computed(() => slotsStore.getAreaModules(uiStore.activeSlot, 0));
	const fxCables = computed(() => slotsStore.getAreaCables(uiStore.activeSlot, 0));
	const currentModules = computed(() => (uiStore.area === 1 ? voiceModules.value : fxModules.value));
	const currentCables = computed(() => (uiStore.area === 1 ? voiceCables.value : fxCables.value));
	const patchName = computed(() => slotsStore.getPatchName(uiStore.activeSlot));

	function applySlotResult(result: { patch: any; name: string } | null): void {
		if (result?.patch?.description?.variation !== undefined) {
			uiStore.variation = result.patch.description.variation;
		}
	}

	// ── Cable / selection ─────────────────────────────────────────────────────

	async function deleteSelection(): Promise<void> {
		try {
			await slotsStore.deleteSelection(
				uiStore.selectedModules,
				uiStore.selectedCables,
				uiStore.area === 1 ? 'voice' : 'fx',
				currentModules.value,
				currentCables.value,
			);
		} finally {
			uiStore.clearSelection();
			uiStore.selectedCables = [];
		}
	}

	async function handleModuleMove({ indices, dCol, dRow }: { indices: number[]; dCol: number; dRow: number; anchorIndex: number }): Promise<void> {
		applySlotResult(await slotsStore.moveModulesWithCollision(indices, dCol, dRow, uiStore.area === 1 ? 'voice' : 'fx', currentModules.value));
	}

	async function handleModuleDrop({ typeId, col, row }: { typeId: number; col: number; row: number }): Promise<void> {
		applySlotResult(await slotsStore.dropModuleWithCollision(typeId, col, row, uiStore.area === 1 ? 'voice' : 'fx', currentModules.value));
	}

	// TODO: Investigate why param changes from editor->G2 are slow. Too much commands send? Does it something extra?
	let paramChangeTimer: ReturnType<typeof setTimeout> | null = null;
	function handleParamChange(moduleIndex: number, paramIndex: number, value: number): void {
		if (device.status !== 'connected') return;
		if (paramChangeTimer) clearTimeout(paramChangeTimer);
		paramChangeTimer = setTimeout(async () => {
			paramChangeTimer = null;
			try {
				await slotsStore.setParam(moduleIndex, paramIndex, value, uiStore.variation, uiStore.area === 1 ? 'voice' : 'fx');
			} catch {
				/* G2 may be temporarily busy */
			}
		}, 50);
	}
	function handleModeChange(moduleIndex: number, index: number, value: number): void {
		if (device.status !== 'connected') return;
		if (paramChangeTimer) clearTimeout(paramChangeTimer);
		paramChangeTimer = setTimeout(async () => {
			paramChangeTimer = null;
			try {
				await slotsStore.setMode(moduleIndex, index, value, uiStore.variation, uiStore.area === 1 ? 'voice' : 'fx');
			} catch {
				/* G2 may be temporarily busy */
			}
		}, 50);
	}

	// ── Module label dialog ───────────────────────────────────────────────────

	const showLabelDialog = ref(false);
	const editingLabel = ref('');
	const editingModuleId = ref<number | null>(null);

	const showParamLabelDialog = ref(false);
	const editingParamLabel = ref('');
	const editingParamLabelModuleId = ref<number | null>(null);
	const editingParamLabelParamIndex = ref<number | null>(null);

	function handleModuleLabelEdit({ moduleIndex, currentLabel }: { moduleIndex: number; currentLabel: string }): void {
		editingModuleId.value = moduleIndex;
		editingLabel.value = currentLabel;
		showLabelDialog.value = true;
	}

	async function confirmModuleLabel(): Promise<void> {
		if (editingModuleId.value === null) return;
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.setModuleLabel(editingModuleId.value, editingLabel.value, area as 'voice' | 'fx');
		showLabelDialog.value = false;
	}

	function handleParamLabelEdit({ moduleIndex, paramIndex, currentLabel }: { moduleIndex: number; paramIndex: number; currentLabel: string }): void {
		editingParamLabelModuleId.value = moduleIndex;
		editingParamLabelParamIndex.value = paramIndex;
		editingParamLabel.value = currentLabel;
		showParamLabelDialog.value = true;
	}

	async function confirmParamLabel(): Promise<void> {
		if (editingParamLabelModuleId.value === null || editingParamLabelParamIndex.value === null) return;
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.setParamLabel(editingParamLabelModuleId.value, editingParamLabelParamIndex.value, editingParamLabel.value, area);
		showParamLabelDialog.value = false;
	}

	// ── Module delete / color ─────────────────────────────────────────────────

	async function handleModuleDelete(moduleIndex: number): Promise<void> {
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.deleteModule(moduleIndex, area as 'voice' | 'fx');
		uiStore.selectModules(uiStore.selectedModules.filter((i) => i !== moduleIndex));
	}

	async function handleModuleColorChange(moduleIndex: number, colorId: number): Promise<void> {
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		const targets = uiStore.selectedModules.includes(moduleIndex) ? uiStore.selectedModules : [moduleIndex];
		uiStore.setModuleColor(colorId);
		await slotsStore.setModuleColors(targets, colorId, area as 'voice' | 'fx');
	}

	// ── Jack disconnect / recolor ─────────────────────────────────────────────

	async function handleJackDeleteConnected({ moduleIndex, connectorIndex, type }: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }): Promise<void> {
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.deleteConnectedCables(moduleIndex, connectorIndex, type, area);
	}

	async function handleJackSetCableColor({ moduleIndex, connectorIndex, type, colorId }: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colorId: number }): Promise<void> {
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.setCableColor(moduleIndex, connectorIndex, type, colorId, area);
	}

	// ── Keyboard ──────────────────────────────────────────────────────────────

	async function handleDeleteKey(e: KeyboardEvent): Promise<void> {
		if (showLabelDialog.value) return;
		if (e.key !== 'Delete' && e.key !== 'Backspace') return;
		await deleteSelection();
	}

	// ── Slot / variation ──────────────────────────────────────────────────────

	async function handleSlotClick(index: number): Promise<void> {
		const slot = SLOT_LABELS[index];
		uiStore.activeSlot = slot;
		slotsStore.activeSlot = slot;
		const patch = slotsStore.slots[slot]?.patch;
		if (patch?.description?.variation !== undefined) uiStore.variation = patch.description.variation;
		if (device.status === 'connected') applySlotResult(await slotsStore.selectSlot(slot));
	}

	async function handleVariationClick(variationIndex: number): Promise<void> {
		uiStore.variation = variationIndex;
		const patch = slotsStore.slots[uiStore.activeSlot]?.patch;
		if (patch?.description) patch.description.variation = variationIndex;
		if (device.status === 'connected') await slotsStore.selectVariation(variationIndex);
	}

	// ── G2 connection ─────────────────────────────────────────────────────────

	const { connectDevice, toggleConnection, hardwareVariationChange, hardwareSlotChange } = useG2();

	const { selectedCategory } = usePatchCategory(computed(() => currentPatch.value));

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onMounted(async () => {
		window.addEventListener('keydown', handleDeleteKey);

		window.electronAPI?.onMenuAction(async (action: string) => {
			// const area = uiStore.area === 1 ? 'voice' : 'fx';
			switch (action) {
				case 'new-patch':
				case 'new-performance': {
					const emptyPatch = {
						areas: [
							{
								name: 'fx',
								modules: [],
								cableList: [],
								paramaterDataOfs: 0,
							},
							{
								name: 'voice',
								modules: [],
								cableList: [],
								paramaterDataOfs: 0,
							},
						],
						description: {
							voices: 1,
							height: 0,
							unk2: 0,
							red: 0,
							blue: 0,
							yellow: 0,
							orange: 0,
							green: 0,
							purple: 0,
							white: 0,
							monopoly: 0,
							variation: 0,
							category: 0,
						},
					};
					slotsStore.loadPatchFile(uiStore.activeSlot, emptyPatch, 'Untitled');
					break;
				}
				case 'open':
					await patchFile.openFromElectronDialog();
					if (currentPatch.value?.description?.variation !== undefined) uiStore.variation = currentPatch.value.description.variation;
					break;
				case 'save':
					if (slotsStore.slots[uiStore.activeSlot]?.templateRawHex) await slotsStore.saveSlot(uiStore.activeSlot);
					break;
				case 'save-as': {
					if (!slotsStore.slots[uiStore.activeSlot]?.templateRawHex) break;
					const name = slotsStore.slots[uiStore.activeSlot].name;
					const result = await window.electronAPI.showSaveDialog(name);
					if (result.success && result.filepath) await slotsStore.saveSlot(uiStore.activeSlot, result.filepath);
					break;
				}
				case 'save-all':
					for (const s of SLOT_LABELS) {
						if (slotsStore.slots[s]?.templateRawHex) await slotsStore.saveSlot(s);
					}
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
				case 'variation-8':
					const variation = parseInt(action.substring(10, 11));
					await handleVariationClick(variation - 1);
					break;
				case 'toggle-svg-viewer':
					uiStore.toggleSvgViewer();
					break;
			}
		});

		await connectDevice();
		if (device.status === 'connected') {
			const focusLabel = (device.device?.patches?.focus ?? device.device?.performance?.focus ?? 'a').toUpperCase();
			const idx = SLOT_LABELS.indexOf(focusLabel as SlotLabel);
			if (idx >= 0) {
				const slot = SLOT_LABELS[idx];
				uiStore.activeSlot = slot;
				slotsStore.activeSlot = slot;
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

	watch(hardwareSlotChange, async (slotIndex) => {
		if (slotIndex === null) return;
		const slot = SLOT_LABELS[slotIndex];
		if (!slot) return;
		device.setActiveSlot(slot);
		uiStore.activeSlot = slot;
		slotsStore.activeSlot = slot;
		if (device.status === 'connected') applySlotResult(await slotsStore.loadSlot(slot));
	});

	watch(hardwareVariationChange, (change) => {
		if (!change) return;
		const changeSlot = SLOT_LABELS[change.slot];
		if (changeSlot !== uiStore.activeSlot) return;
		uiStore.variation = change.variation;
		const activePatch = slotsStore.slots[uiStore.activeSlot]?.patch;
		if (activePatch?.description) activePatch.description.variation = change.variation;
	});
</script>
