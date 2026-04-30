<template>
	<svg style="position: absolute; width: 0; height: 0; overflow: hidden" aria-hidden="true">
		<SvgGradientDefs />
	</svg>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel>Perf:</ToolBarLabel>
				<ToolBarText class="w-32">{{ device.perfName }}</ToolBarText>
				<ToolBarLabel>Master Clock</ToolBarLabel>
				<ToolBarText class="w-10">{{ device.bpm }}</ToolBarText>
				<Button variant="toggle"><span v-if="device.clockRunning">Run</span><span v-else>Stop</span></Button>
				<ToolBarText class="w-32">{{ device.deviceName }}</ToolBarText>
				<BtnGroup :model-value="uiStore.selectedSlotIndex" :options="SLOT_OPTIONS" variant="toggle" @update:model-value="handleSlotClick" />
			</template>

			<Button variant="file" accept=".pch2,.prf2" @change="patchFile.handleFileLoad">Load Patch</Button>
			<Button variant="default" :disabled="!slotsStore.slots[uiStore.activeSlot]?.templateRawHex">Save Patch</Button>

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
			<ToolBarText class="w-32">{{ patchName }}</ToolBarText>

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

			<BtnGroup v-model="uiStore.area" :options="AREA_OPTIONS" variant="toggle" />

			<ToolBarDivider />

			<div class="flex items-center gap-2">
				<span class="text-xs font-semibold text-neutral-400">Var:</span>
				<BtnGroup v-model="uiStore.variation" :options="VARIATION_OPTIONS" variant="variation" @update:model-value="handleVariationClick" />
			</div>

			<ToolBarDivider />

			<ColorPicker />

			<ToolBarDivider />

			<div class="flex items-center gap-2">
				<div class="flex gap-1">
					<button
						v-for="color in cableColors"
						:key="color.name"
						class="w-5 h-5 border-2 border-solid rounded cursor-pointer p-0 flex items-center justify-center transition-all duration-200 opacity-40 hover:opacity-70 hover:scale-110"
						:class="{ 'opacity-100 shadow-sm': cableVisibility[color.name] }"
						:style="{ backgroundColor: color.hex, borderColor: color.hex }"
						:title="color.label + (cableVisibility[color.name] ? ' (visible)' : ' (hidden)')"
						@click="toggleCableVisibility(color.name)"
					>
						<span
							class="w-2 h-2 rounded-full opacity-0 transition-opacity duration-200"
							:class="{ 'opacity-100': cableVisibility[color.name] }"
							:style="{ backgroundColor: 'rgba(0,0,0,0.5)' }"
						></span>
					</button>
					<button
						class="w-6 h-5 border-2 border-neutral-600 rounded bg-gray-300 text-gray-800 text-xs font-bold hover:bg-gray-200"
						:class="{ 'bg-gray-500 border-neutral-500 text-white shadow': allCablesVisible }"
						:title="allCablesVisible ? 'Hide all cables' : 'Show all cables'"
						@click="toggleShowHideAll"
					>
						H
					</button>
					<button
						class="w-6 h-5 border-2 border-neutral-500 rounded bg-gray-200 text-gray-800 text-xs font-bold ml-1 hover:bg-gray-300 active:bg-gray-400"
						title="Re-render cables"
						@click="shakeCables"
					>
						S
					</button>
				</div>
			</div>
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
						:cable-visibility="cableVisibility"
						:shake-trigger="cableShakeTrigger"
						:selected-cable="uiStore.selectedCable"
						:selected-module-indices="uiStore.selectedModules"
						@cable-click="handleCableClick"
						@jack-drag-start="jackPatching.handleJackDragStart"
						@jack-drag-end="jackPatching.handleJackDragEnd"
						@module-move="handleModuleMove"
						@module-drop="handleModuleDrop"
						@param-change="handleParamChange"
					/>
					<PatchCanvas
						v-show="uiStore.area === 0"
						:key="patchName + '-fx'"
						:modules="fxModules"
						:cables="fxCables"
						:variation="uiStore.variation"
						area="fx"
						:cable-visibility="cableVisibility"
						:shake-trigger="cableShakeTrigger"
						:selected-cable="uiStore.selectedCable"
						:selected-module-indices="uiStore.selectedModules"
						@cable-click="handleCableClick"
						@jack-drag-start="jackPatching.handleJackDragStart"
						@jack-drag-end="jackPatching.handleJackDragEnd"
						@module-move="handleModuleMove"
						@module-drop="handleModuleDrop"
						@param-change="handleParamChange"
					/>
				</template>
				<div v-else class="flex items-center justify-center h-full text-neutral-500 text-sm">Load a .pch2 or .prf2 file to begin</div>
			</div>

			<SidePanel v-if="uiStore.showRightPane">
				<ModulesPane v-show="uiStore.rightPaneTab === 'modules'" :isActive="uiStore.rightPaneTab === 'modules'" />
				<PatchBrowser
					v-show="uiStore.rightPaneTab === 'browser'"
					:isActive="uiStore.rightPaneTab === 'browser'"
					@select="patchFile.handlePatchSelect"
				/>
			</SidePanel>
		</div>

		<StatusBar @toggle-connection="toggleConnection" />
	</div>
</template>

<script setup lang="ts">
	import { computed, watch, onMounted, onUnmounted } from 'vue';
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
	import SvgGradientDefs from './components/canvas/SvgGradientDefs.vue';

	import { useG2 } from './composables/useG2';
	import { useJackPatching } from './composables/useJackPatching';
	import { usePatchFile } from './composables/usePatchFile';
	import { useDeviceStore } from './store/device';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { PaneTab } from './store/ui';
	import type { SlotLabel } from './store/slots';
	import { useCableVisibility } from './composables/useCableVisibility';
	import { usePatchCategory } from './composables/usePatchCategory';
	import { useBrowserStore } from './store/browser';

	import { SOUND_CATEGORIES as soundCategories, SLOT_LABELS, SLOT_OPTIONS, PANE_TAB_OPTIONS, AREA_OPTIONS, VARIATION_OPTIONS } from './constants';

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

	function handleCableClick(cable: Cable): void {
		const same = (a: Cable, b: Cable) => a.smod === b.smod && a.scon === b.scon && a.dmod === b.dmod && a.dcon === b.dcon;
		uiStore.selectedCable = uiStore.selectedCable && same(uiStore.selectedCable, cable) ? null : cable;
	}

	async function deleteSelection(): Promise<void> {
		try {
			await slotsStore.deleteSelection(
				uiStore.selectedModules,
				uiStore.selectedCable,
				uiStore.area === 1 ? 'voice' : 'fx',
				currentModules.value,
				currentCables.value,
			);
		} finally {
			uiStore.clearSelection();
			uiStore.selectedCable = null;
		}
	}

	async function handleModuleMove({ moduleIndex, col, row }: { moduleIndex: number; col: number; row: number }): Promise<void> {
		applySlotResult(await slotsStore.moveModuleWithCollision(moduleIndex, col, row, uiStore.area === 1 ? 'voice' : 'fx', currentModules.value));
	}

	async function handleModuleDrop({ typeId, col, row }: { typeId: number; col: number; row: number }): Promise<void> {
		applySlotResult(await slotsStore.dropModuleWithCollision(typeId, col, row, uiStore.area === 1 ? 'voice' : 'fx', currentModules.value));
	}

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

	// ── Keyboard ──────────────────────────────────────────────────────────────

	async function handleDeleteKey(e: KeyboardEvent): Promise<void> {
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

	const {
		cableColors,
		cableVisibility,
		cableShakeTrigger,
		allCablesVisible,
		toggleCableVisibility,
		toggleShowHideAll,
		shakeCables,
		syncWithPatchData,
		updatePatchData,
	} = useCableVisibility();

	const { selectedCategory } = usePatchCategory(computed(() => currentPatch.value));

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onMounted(async () => {
		window.addEventListener('keydown', handleDeleteKey);
		window.addEventListener('mouseup', () => {
			jackPatching.dragSource.value = null;
		});

		window.electronAPI?.onMenuAction(async (action: string) => {
			const area = uiStore.area === 1 ? 'voice' : 'fx';
			switch (action) {
				case 'new-patch':
				case 'new-performance': {
					const emptyPatch = {
						areas: [
							{ name: 'fx', modules: [], cableList: [], paramaterDataOfs: 0 },
							{ name: 'voice', modules: [], cableList: [], paramaterDataOfs: 0 },
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
					const result = await window.electronAPI.showSaveDialog();
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
				case 'area-voice':
					uiStore.area = 1;
					break;
				case 'area-fx':
					uiStore.area = 0;
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
		if (changeSlot !== device.getActiveSlot) return;
		uiStore.variation = change.variation;
		const activePatch = slotsStore.slots[uiStore.activeSlot]?.patch;
		if (activePatch?.description) activePatch.description.variation = change.variation;
	});

	watch(
		cableVisibility,
		() => {
			updatePatchData(currentPatch.value?.description);
		},
		{ deep: true },
	);
</script>
