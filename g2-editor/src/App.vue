<template>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<template v-if="device">
				<ToolBarLabel>Perf:</ToolBarLabel>
				<ToolBarText class="w-32">{{ device.perfName }}</ToolBarText>
				<ToolBarLabel>Master Clock</ToolBarLabel>
				<ToolBarText class="w-10">{{ device.bpm }}</ToolBarText>
				<Button variant="toggle"><span v-if="device.clockRunning">Run</span><span v-else>Stop</span></Button>
				<ToolBarText class="w-32">{{ device.deviceName }}</ToolBarText>
				<!-- SLOT BUTTONS -->
				<BtnGroup
					:model-value="selectedSlotIndex"
					:options="[
						{ label: 'A', value: 0 },
						{ label: 'B', value: 1 },
						{ label: 'C', value: 2 },
						{ label: 'D', value: 3 },
					]"
					variant="toggle"
					@update:model-value="handleSlotClick"
				/>
			</template>

			<Button variant="file" accept=".pch2,.prf2" @change="handleFileLoad">Load Patch</Button>
			<Button variant="default" :disabled="!patch">Save Patch</Button>
			<!-- <Button
				variant="default"
				:disabled="!patch || deviceStatus !== 'connected'"
				@click="uploadToG2(patch)"
			>
				Upload to G2
			</Button>
			<Button
				variant="default"
				:disabled="deviceStatus !== 'connected'"
				@click="downloadFromG2"
			>
				Download from G2
			</Button> -->

			<ToolBarDivider />

			<span class="ml-auto text-xs text-neutral-500" :class="{ 'text-green-600': deviceStatus === 'connected', 'text-red-500': deviceStatus === 'lost' }">
				{{ statusText }}
			</span>

			<Button v-if="deviceStatus === 'connected'" variant="default" @click="disconnectDevice"> Disconnect </Button>
			<Button v-else variant="default" :disabled="deviceStatus === 'connecting'" @click="connectDevice">
				{{ deviceStatus === 'connecting' ? 'Connecting...' : deviceStatus === 'lost' ? 'Reconnect' : 'Connect G2' }}
			</Button>

			<ToolBarDivider />

			<BtnGroup
				:model-value="rightPaneTab"
				:options="[
					{ label: 'USB', value: 'usb' },
					{ label: 'Browser', value: 'browser' },
				]"
				variant="tab"
				@update:model-value="toggleSidebar"
				@toggle-off="handleToggleOff"
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

			<span class="text-xs text-neutral-600">
				Voice: {{ areaModulesCount('voice') }} modules, {{ areaCablesCount('voice') }} cables<br />
				FX: {{ areaModulesCount('fx') }} modules, {{ areaCablesCount('fx') }} cables<br />
			</span>

			<ToolBarDivider />

			<BtnGroup
				v-model="selectedArea"
				:options="[
					{ value: 'voice', label: 'Voice' },
					{ value: 'fx', label: 'FX' },
				]"
				variant="toggle"
			/>

			<ToolBarDivider />

			<div class="flex items-center gap-2">
				<span class="text-xs font-semibold text-neutral-400">Var:</span>
				<BtnGroup
					v-model="variation"
					:options="[
						{ label: '1', value: 0 },
						{ label: '2', value: 1 },
						{ label: '3', value: 2 },
						{ label: '4', value: 3 },
						{ label: '5', value: 4 },
						{ label: '6', value: 5 },
						{ label: '7', value: 6 },
						{ label: '8', value: 7 },
					]"
					variant="variation"
					@update:model-value="handleVariationClick"
				/>
			</div>

			<ToolBarDivider />

			<div class="flex items-center gap-2">
				<span class="text-xs font-semibold text-neutral-400">Cables:</span>
				<div class="flex gap-1">
					<button
						v-for="color in cableColors"
						:key="color.name"
						class="w-5 h-5 border-2 border-solid rounded cursor-pointer p-0 flex items-center justify-center transition-all duration-200 opacity-40 hover:opacity-70 hover:scale-110"
						:class="{
							'opacity-100 shadow-sm': cableVisibility[color.name],
						}"
						:style="{
							backgroundColor: color.hex,
							borderColor: color.hex,
						}"
						:title="color.label + (cableVisibility[color.name] ? ' (visible)' : ' (hidden)')"
						@click="toggleCableVisibility(color.name)"
					>
						<span
							class="w-2 h-2 rounded-full opacity-0 transition-opacity duration-200"
							:class="{
								'opacity-100': cableVisibility[color.name],
							}"
							:style="{ backgroundColor: 'rgba(0,0,0,0.5)' }"
						></span>
					</button>
					<button
						class="w-6 h-5 border-2 border-neutral-600 rounded bg-gray-300 text-gray-800 text-xs font-bold hover:bg-gray-200"
						:class="{
							'bg-gray-500 border-neutral-500 text-white shadow': allCablesVisible,
						}"
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
			<SidePanel>
				<ModulesPane />
			</SidePanel>

			<div class="flex-1 overflow-auto bg-neutral-900 relative">
				<PatchCanvas
					v-if="patch"
					:key="patchName"
					:modules="currentModules"
					:cables="currentCables"
					:variation="variation"
					:area="selectedArea"
					:cable-visibility="cableVisibility"
					:shake-trigger="cableShakeTrigger"
					:selected-cable="selectedCable"
					@cable-click="handleCableClick"
					@jack-drag-start="handleJackDragStart"
					@jack-drag-end="handleJackDragEnd"
				/>
				<div v-else class="flex items-center justify-center h-full text-neutral-500 text-sm">Load a .pch2 or .prf2 file to begin</div>
			</div>

			<SidePanel v-if="showRightPane">
				<UsbPanel
					v-show="rightPaneTab === 'usb'"
					:logs="usbLogs"
					:device-status="deviceStatus"
					@disconnect="disconnectDevice"
					@connect="connectDevice"
					@clear-logs="clearLogs"
				/>
				<PatchBrowser v-show="rightPaneTab === 'browser'" :isActive="rightPaneTab === 'browser'" @select="handlePatchSelect" />
			</SidePanel>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
	import type { Cable } from './renderer/cableRenderer';
	import PatchCanvas from './components/canvas/PatchCanvas.vue';
	import PatchBrowser from './components/panels/PatchBrowser.vue';
	import SidePanel from './components/panels/SidePanel.vue';
	import ModulesPane from './components/panels/ModulesPane.vue';
	import UsbPanel from './components/panels/UsbPanel.vue';
	import Button from './components/toolbar/Button.vue';
	import BtnGroup from './components/toolbar/BtnGroup.vue';
	import ToolBar from './components/toolbar/ToolBar.vue';
	import ToolBarLabel from './components/toolbar/ToolBarLabel.vue';
	import ToolBarText from './components/toolbar/ToolBarText.vue';
	import ToolBarDivider from './components/toolbar/ToolBarDivider.vue';

	import { usePatchManager } from './composables/usePatchManager';
	import { useG2 } from './composables/useG2';
	import { useDeviceStore } from './store/device';
	import { useSlotsStore } from './store/slots';
	import { useCableVisibility } from './composables/useCableVisibility';
	import { usePatchCategory } from './composables/usePatchCategory';
	import { useRightPanel } from './composables/useRightPanel';

	import { SOUND_CATEGORIES as soundCategories } from './constants';

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();

	const selectedCable = ref<Cable | null>(null);
	const dragSource = ref<{ moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string } | null>(null);

	const {
		patch,
		patchName,
		variation,
		selectedArea,
		currentModules,
		currentCables,
		areaModulesCount,
		areaCablesCount,
		handleFileLoad,
		handlePatchSelect,
		setPatch,
	} = usePatchManager();

	const SLOT_LABELS = ['A', 'B', 'C', 'D'] as const;
	const selectedSlotIndex = computed<number | null>(() => {
		const label = device.getActiveSlot;
		if (!label) return null;
		return SLOT_LABELS.indexOf(label);
	});

	function applySlotResult(result: { patch: any; name: string } | null) {
		if (!result?.patch) return;
		setPatch(result.patch, result.name);
		variation.value = result.patch.description?.variation ?? 0;
	}

	function handleCableClick(cable: Cable) {
		selectedCable.value = selectedCable.value && isSameCable(selectedCable.value, cable) ? null : cable;
	}

	function isSameCable(a: Cable, b: Cable): boolean {
		return a.smod === b.smod && a.scon === b.scon && a.dmod === b.dmod && a.dcon === b.dcon;
	}

	async function handleJackDragStart(info: typeof dragSource.value) {
		dragSource.value = info;
	}

	async function handleJackDragEnd(info: typeof dragSource.value) {
		if (!info || !dragSource.value) {
			dragSource.value = null;
			return;
		}
		const src = dragSource.value;
		dragSource.value = null;
		if (src.moduleIndex === info.moduleIndex && src.connectorIndex === info.connectorIndex && src.type === info.type) return;
		if (src.type === info.type) return; // can't connect same type
		const output = src.type === 'output' ? src : info;
		const input = src.type === 'input' ? src : info;
		applySlotResult(
			await slotsStore.addCable(
				output.moduleIndex,
				1,
				output.connectorIndex,
				input.moduleIndex,
				0,
				input.connectorIndex,
				selectedArea.value as 'voice' | 'fx',
			),
		);
	}

	async function handleDeleteKey(e: KeyboardEvent) {
		if (e.key !== 'Delete' && e.key !== 'Backspace') return;
		if (!selectedCable.value) return;
		const cable = selectedCable.value;
		selectedCable.value = null;
		applySlotResult(
			await slotsStore.deleteCable({ smod: cable.smod!, scon: cable.scon!, dmod: cable.dmod!, dcon: cable.dcon! }, selectedArea.value as 'voice' | 'fx'),
		);
	}

	async function loadSlotPatch(index: number) {
		const slot = SLOT_LABELS[index];
		applySlotResult(await slotsStore.loadSlot(slot));
	}

	async function handleSlotClick(index: number) {
		const slot = SLOT_LABELS[index];
		applySlotResult(await slotsStore.selectSlot(slot));
	}

	async function handleVariationClick(variationIndex: number) {
		await slotsStore.selectVariation(variationIndex);
	}

	const {
		deviceStatus,
		statusText,
		usbLogs,
		connectDevice,
		disconnectDevice,
		// uploadToG2,
		// downloadFromG2,
		clearLogs,
		hardwareVariationChange,
		hardwareSlotChange,
	} = useG2();

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

	const { selectedCategory } = usePatchCategory(patch);

	const { rightPaneTab, showRightPane, toggleSidebar, handleToggleOff } = useRightPanel();

	function handleWindowMouseup() {
		dragSource.value = null;
	}

	onMounted(async () => {
		window.addEventListener('keydown', handleDeleteKey);
		window.addEventListener('mouseup', handleWindowMouseup);
		await connectDevice();
		if (device.status !== 'connected') return;
		const focusLabel = (device.device?.patches?.focus ?? device.device?.performance?.focus ?? 'a').toUpperCase();
		const idx = ['A', 'B', 'C', 'D'].indexOf(focusLabel);
		if (idx >= 0) {
			await loadSlotPatch(idx);
		}
	});

	onUnmounted(() => {
		window.removeEventListener('keydown', handleDeleteKey);
		window.removeEventListener('mouseup', handleWindowMouseup);
	});

	watch(hardwareSlotChange, async (slotIndex) => {
		if (slotIndex === null) return;
		const slot = SLOT_LABELS[slotIndex];
		if (!slot) return;
		device.setActiveSlot(slot);
		applySlotResult(await slotsStore.loadSlot(slot));
	});

	watch(hardwareVariationChange, (change) => {
		if (!change) return;
		const changeSlot = (['A', 'B', 'C', 'D'] as const)[change.slot];
		if (changeSlot !== device.getActiveSlot) return;
		variation.value = change.variation;
	});

	watch(
		() => patch.value?.description,
		(description) => {
			syncWithPatchData(description);
		},
		{ immediate: true, deep: true },
	);

	watch(
		cableVisibility,
		() => {
			updatePatchData(patch.value?.description);
		},
		{ deep: true },
	);
</script>
