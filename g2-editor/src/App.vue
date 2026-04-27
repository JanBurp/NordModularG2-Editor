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
			<Button variant="default" :disabled="!slotsStore.slots[uiStore.activeSlot]?.rawHex">Save Patch</Button>

			<ToolBarDivider />

			<BtnGroup
				class="ml-auto"
				:model-value="uiStore.rightPaneTab"
				:options="[
					{ label: 'Modules', value: 'modules' },
					{ label: 'USB', value: 'usb' },
					{ label: 'Browser', value: 'browser' },
				]"
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

			<BtnGroup
				v-model="uiStore.area"
				:options="[
					{ value: 1, label: 'Voice' },
					{ value: 0, label: 'FX' },
				]"
				variant="toggle"
			/>

			<ToolBarDivider />

			<div class="flex items-center gap-2">
				<span class="text-xs font-semibold text-neutral-400">Var:</span>
				<BtnGroup
					v-model="uiStore.variation"
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
			<div class="flex-1 overflow-auto bg-neutral-900 relative">
				<PatchCanvas
					v-if="currentPatch"
					:key="patchName"
					:modules="currentModules"
					:cables="currentCables"
					:variation="uiStore.variation"
					:area="uiStore.area === 1 ? 'voice' : 'fx'"
					:cable-visibility="cableVisibility"
					:shake-trigger="cableShakeTrigger"
					:selected-cable="selectedCable"
					:selected-module-index="selectedModule"
					@cable-click="handleCableClick"
					@jack-drag-start="handleJackDragStart"
					@jack-drag-end="handleJackDragEnd"
					@module-click="handleModuleClick"
					@module-move="handleModuleMove"
					@module-drop="handleModuleDrop"
					@canvas-click="handleCanvasClick"
					@param-change="handleParamChange"
				/>
				<div v-else class="flex items-center justify-center h-full text-neutral-500 text-sm">Load a .pch2 or .prf2 file to begin</div>
			</div>

			<SidePanel v-if="uiStore.showRightPane">
				<ModulesPane v-show="uiStore.rightPaneTab === 'modules'" :isActive="uiStore.rightPaneTab === 'modules'" />
				<UsbPanel
					v-show="uiStore.rightPaneTab === 'usb'"
					:logs="usbLogs"
					:device-status="deviceStatus"
					@disconnect="disconnectDevice"
					@connect="connectDevice"
					@clear-logs="clearLogs"
				/>
				<PatchBrowser v-show="uiStore.rightPaneTab === 'browser'" :isActive="uiStore.rightPaneTab === 'browser'" @select="handlePatchSelect" />
			</SidePanel>
		</div>
		<StatusBar>
			<BtnGroup
				v-model="uiStore.area"
				size="xs"
				:options="[
					{ value: 1, label: 'Voice' },
					{ value: 0, label: 'FX' },
				]"
				variant="toggle"
			/>

			<span> Voice: {{ areaModulesCount('voice') }} modules / {{ areaCablesCount('voice') }} cables<br /> </span>
			<StatusBarDivider></StatusBarDivider>
			<span> FX: {{ areaModulesCount('fx') }} modules / {{ areaCablesCount('fx') }} cables<br /> </span>

			<div
				class="ml-auto flex gap-2 items-center px-2 cursor-pointer"
				:class="device.status === 'connected' ? 'bg-green-500' : 'bg-orange-500'"
				@click="uiStore.toggleSidebar('usb')"
			>
				<span>🔌</span>
				<span>{{ device.status }}</span>
			</div>
		</StatusBar>
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
	import StatusBar from './components/toolbar/StatusBar.vue';
	import StatusBarDivider from './components/toolbar/StatusBarDivider.vue';

	import { getModule } from './renderer/nmg2mods';
	import { useG2 } from './composables/useG2';
	import { useDeviceStore } from './store/device';
	import { useSlotsStore } from './store/slots';
	import { useUiStore } from './store/ui';
	import type { PaneTab } from './store/ui';
	import { useCableVisibility } from './composables/useCableVisibility';
	import { usePatchCategory } from './composables/usePatchCategory';
	import { useBrowserStore } from './store/browser';

	import { SOUND_CATEGORIES as soundCategories, CABLE_COLOR_INDEX_MAP } from './constants';

	function jackColourToIndex(colour: string): number {
		const entry = Object.entries(CABLE_COLOR_INDEX_MAP).find(([, name]) => name === colour);
		return entry ? Number(entry[0]) : 1; // default to blue
	}

	const device = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const browserStore = useBrowserStore();

	const selectedCable = ref<Cable | null>(null);
	const selectedModule = ref<number | -1 | null>(null);
	const dragSource = ref<{ moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string } | null>(null);

	const SLOT_LABELS = ['A', 'B', 'C', 'D'] as const;

	const currentPatch = computed(() => slotsStore.slots[uiStore.activeSlot]?.patch);
	const currentModules = computed(() => {
		if (!currentPatch.value?.areas) return [];
		return currentPatch.value.areas[uiStore.area]?.modules || [];
	});
	const currentCables = computed(() => {
		if (!currentPatch.value?.areas) return [];
		return currentPatch.value.areas[uiStore.area]?.cableList || [];
	});
	const patchName = computed(() => slotsStore.slots[uiStore.activeSlot]?.name || '');
	const selectedSlotIndex = computed<number | null>(() => {
		const label = device.getActiveSlot;
		if (!label) return SLOT_LABELS.indexOf(uiStore.activeSlot);
		return SLOT_LABELS.indexOf(label);
	});

	const areaModulesCount = (area: 'voice' | 'fx') => {
		const areaIndex = area === 'voice' ? 1 : 0;
		return currentPatch.value?.areas?.[areaIndex]?.modules?.length ?? 0;
	};
	const areaCablesCount = (area: 'voice' | 'fx') => {
		const areaIndex = area === 'voice' ? 1 : 0;
		return currentPatch.value?.areas?.[areaIndex]?.cableList?.length ?? 0;
	};

	function applySlotResult(result: { patch: any; name: string } | null) {
		if (!result?.patch) return;
		if (result.patch?.description?.variation !== undefined) {
			uiStore.variation = result.patch.description.variation;
		}
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
				uiStore.area === 1 ? 'voice' : 'fx',
				jackColourToIndex(output.colour),
			),
		);
	}

	function deleteSelection() {
		if (selectedModule.value !== null && !selectedCable.value) {
			if (selectedModule.value === -1) {
				// select-all case: delete all modules in current area
				const modulesToDelete = currentModules.value.map((m: any) => m.index);
				for (const moduleId of modulesToDelete) {
					const connectedCables = currentCables.value.filter((c: any) => c.smod === moduleId || c.dmod === moduleId);
					for (const cable of connectedCables) {
						slotsStore.deleteCableNoReload(cable as any, uiStore.area === 1 ? 'voice' : 'fx');
					}
					slotsStore.deleteModule(moduleId, uiStore.area === 1 ? 'voice' : 'fx');
				}
				selectedModule.value = null;
				return;
			}
			const moduleId = selectedModule.value;
			const connectedCables = currentCables.value.filter((c: any) => c.smod === moduleId || c.dmod === moduleId);
			for (const cable of connectedCables) {
				slotsStore.deleteCableNoReload(cable as any, uiStore.area === 1 ? 'voice' : 'fx');
			}
			slotsStore.deleteModule(moduleId, uiStore.area === 1 ? 'voice' : 'fx');
			selectedModule.value = null;
			return;
		}

		if (!selectedCable.value) return;
		const cable = selectedCable.value;
		slotsStore.deleteCable({ smod: cable.smod!, scon: cable.scon!, dmod: cable.dmod!, dcon: cable.dcon! }, uiStore.area === 1 ? 'voice' : 'fx');
		selectedCable.value = null;
	}

	async function handleDeleteKey(e: KeyboardEvent) {
		if (e.key !== 'Delete' && e.key !== 'Backspace') return;
		deleteSelection();
	}

	function handleModuleClick(moduleIndex: number) {
		if (selectedModule.value === -1) {
			selectedModule.value = null;
		} else {
			selectedModule.value = selectedModule.value === moduleIndex ? null : moduleIndex;
		}
		selectedCable.value = null;
	}

	function handleCanvasClick() {
		selectedModule.value = null;
	}

	let paramChangeTimer: ReturnType<typeof setTimeout> | null = null;

	function handleParamChange(moduleIndex: number, paramIndex: number, value: number): void {
		if (deviceStatus.value !== 'connected') return;
		if (paramChangeTimer) clearTimeout(paramChangeTimer);
		paramChangeTimer = setTimeout(async () => {
			paramChangeTimer = null;
			try {
				await slotsStore.setParam(moduleIndex, paramIndex, value, uiStore.variation, uiStore.area === 1 ? 'voice' : 'fx');
			} catch {
				// ignore — G2 may be temporarily busy
			}
		}, 50);
	}

	// Returns modules that need to be displaced and their new rows.
	// The new/moved module is treated as fixed at (targetRow, targetRow+targetHeight).
	// Any existing module in the same column that would overlap is pushed down in cascade.
	function resolveColumnCollisions(
		colModules: { index: number; vert: number; height: number }[],
		targetRow: number,
		targetHeight: number,
	): { index: number; newRow: number }[] {
		const sorted = [...colModules].sort((a, b) => a.vert - b.vert);
		const newRows = new Map(sorted.map((m) => [m.index, m.vert]));
		let floor = targetRow + targetHeight;
		for (const mod of sorted) {
			const r = newRows.get(mod.index)!;
			if (r + mod.height <= targetRow) continue; // entirely above the placed module
			if (r < floor) {
				newRows.set(mod.index, floor);
				floor += mod.height;
			} else {
				floor = r + mod.height;
			}
		}
		return sorted.filter((m) => newRows.get(m.index) !== m.vert).map((m) => ({ index: m.index, newRow: newRows.get(m.index)! }));
	}

	function moduleHeight(m: any): number {
		return (getModule(m.type) as any)?.height || 2;
	}

	async function handleModuleMove({ moduleIndex, col, row }: { moduleIndex: number; col: number; row: number }) {
		const mod = (currentModules.value as any[]).find((m: any) => m.index === moduleIndex);
		if (!mod) return;
		const height = moduleHeight(mod);
		const colModules = (currentModules.value as any[])
			.filter((m: any) => m.horiz === col && m.index !== moduleIndex)
			.map((m: any) => ({ index: m.index as number, vert: m.vert as number, height: moduleHeight(m) }));
		const displaced = resolveColumnCollisions(colModules, row, height);
		for (const d of displaced) {
			await slotsStore.moveModuleNoReload(d.index, col, d.newRow, uiStore.area === 1 ? 'voice' : 'fx');
		}
		applySlotResult(await slotsStore.moveModule(moduleIndex, col, row, uiStore.area === 1 ? 'voice' : 'fx'));
	}

	async function handleModuleDrop({ typeId, col, row }: { typeId: number; col: number; row: number }) {
		const ids = (currentModules.value as any[]).map((m: any) => m.index as number);
		const moduleId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
		const height = (getModule(typeId) as any)?.height || 2;
		const colModules = (currentModules.value as any[])
			.filter((m: any) => m.horiz === col)
			.map((m: any) => ({ index: m.index as number, vert: m.vert as number, height: moduleHeight(m) }));
		const displaced = resolveColumnCollisions(colModules, row, height);
		for (const d of displaced) {
			await slotsStore.moveModuleNoReload(d.index, col, d.newRow, uiStore.area === 1 ? 'voice' : 'fx');
		}
		applySlotResult(await slotsStore.addModule(typeId, moduleId, col, row, uiStore.area === 1 ? 'voice' : 'fx'));
	}

	async function loadSlotPatch(index: number) {
		const slot = SLOT_LABELS[index];
		applySlotResult(await slotsStore.loadSlot(slot));
	}

	async function handleSlotClick(index: number) {
		const slot = SLOT_LABELS[index];
		uiStore.activeSlot = slot;
		const patch = slotsStore.slots[slot]?.patch;
		if (patch?.description?.variation !== undefined) {
			uiStore.variation = patch.description.variation;
		}
		if (device.status === 'connected') {
			applySlotResult(await slotsStore.selectSlot(slot));
		}
	}

	async function handleVariationClick(variationIndex: number) {
		uiStore.variation = variationIndex;
		const patch = slotsStore.slots[uiStore.activeSlot]?.patch;
		if (patch?.description) {
			patch.description.variation = variationIndex;
		}
		if (device.status === 'connected') {
			await slotsStore.selectVariation(variationIndex);
		}
	}

	async function handleFileLoad(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async (e) => {
			const buffer = e.target?.result;
			if (!buffer || !(buffer instanceof ArrayBuffer)) return;
			const { PatchParser } = await import('./parser/nmg2PatchParser');
			const parser = new PatchParser(buffer);
			const parsedPatch = parser.parse() as any;
			const name = file.name.replace('.pch2', '').replace('.prf2', '');
			const rawHex = Array.from(new Uint8Array(buffer))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex);
			if (parsedPatch?.description?.variation !== undefined) {
				uiStore.variation = parsedPatch.description.variation;
			}
		};
		reader.readAsArrayBuffer(file);
	}

	async function handlePatchSelect(item: { type: 'disk'; filepath: string } | { type: 'synth'; bank: number; location: number }) {
		if (item.type === 'disk') {
			if (typeof window === 'undefined' || !window.electronAPI) return;
			try {
				const result = await window.electronAPI.patches.load(item.filepath);
				if (!result.success || !result.data) return;
				const buffer = new Uint8Array(result.data).buffer;
				const { PatchParser } = await import('./parser/nmg2PatchParser');
				const parsedPatch = new PatchParser(buffer).parse() as any;
				const name = (item.filepath.split('/').pop() ?? item.filepath).replace(/\.(pch2|prf2)$/i, '');
				const rawHex = result.data.map((b: number) => b.toString(16).padStart(2, '0')).join('');
				slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex, item.filepath);
				if (parsedPatch?.description?.variation !== undefined) {
					uiStore.variation = parsedPatch.description.variation;
				}
				if (deviceStatus.value === 'connected') {
					try {
						await window.cli.run(['upload-patch', uiStore.activeSlot, item.filepath]);
						// applySlotResult(await slotsStore.loadSlot(uiStore.activeSlot));
					} catch (uploadErr) {
						console.error('Upload to G2 failed:', uploadErr);
					}
				}
			} catch (err) {
				console.error('Failed to load patch:', err);
			}
		} else {
			if (deviceStatus.value !== 'connected') return;
			try {
				await window.cli.run(['select-patch', uiStore.activeSlot, String(item.bank), String(item.location)]);
				applySlotResult(await slotsStore.loadSlot(uiStore.activeSlot));
			} catch (err) {
				console.error('Failed to select synth patch:', err);
			}
		}
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

	const { selectedCategory } = usePatchCategory(computed(() => currentPatch.value));

	function handleWindowMouseup() {
		dragSource.value = null;
	}

	onMounted(async () => {
		window.addEventListener('keydown', handleDeleteKey);
		window.addEventListener('mouseup', handleWindowMouseup);

		window.electronAPI?.onMenuAction(async (action: string) => {
			switch (action) {
				case 'new-patch': {
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
				case 'open': {
					const result = await window.electronAPI.openPatchDialog();
					if (!result.success || !result.data) break;
					const buffer = new Uint8Array(result.data).buffer;
					const { PatchParser } = await import('./parser/nmg2PatchParser');
					const parsedPatch = new PatchParser(buffer).parse() as any;
					const name = (result.filepath!.split('/').pop() ?? result.filepath!).replace(/\.(pch2|prf2)$/i, '');
					const rawHex = result.data.map((b: number) => b.toString(16).padStart(2, '0')).join('');
					slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex, result.filepath!);
					if (parsedPatch?.description?.variation !== undefined) {
						uiStore.variation = parsedPatch.description.variation;
					}
					break;
				}
				case 'save': {
					const slot = slotsStore.slots[uiStore.activeSlot];
					if (slot?.rawHex) await slotsStore.saveSlot(uiStore.activeSlot);
					break;
				}
				case 'save-as': {
					const slot = slotsStore.slots[uiStore.activeSlot];
					if (!slot?.rawHex) break;
					const result = await window.electronAPI.showSaveDialog();
					if (result.success && result.filepath) {
						await slotsStore.saveSlot(uiStore.activeSlot, result.filepath);
					}
					break;
				}
				case 'save-all':
					for (const s of ['A', 'B', 'C', 'D'] as SlotLabel[]) {
						if (slotsStore.slots[s]?.rawHex) {
							await slotsStore.saveSlot(s);
						}
					}
					break;
				case 'delete':
					deleteSelection();
					break;
				case 'select-all':
					selectedModule.value = -1;
					break;
				case 'toggle-modules':
					uiStore.toggleSidebar('modules');
					break;
				case 'toggle-browser':
					uiStore.toggleSidebar('browser');
					break;
				case 'toggle-usb':
					uiStore.toggleSidebar('usb');
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
			const idx = ['A', 'B', 'C', 'D'].indexOf(focusLabel);
			if (idx >= 0) {
				const slot = SLOT_LABELS[idx];
				uiStore.activeSlot = slot;
				await loadSlotPatch(idx);
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
		window.removeEventListener('mouseup', handleWindowMouseup);
		window.electronAPI?.offMenuAction();
	});

	watch(hardwareSlotChange, async (slotIndex) => {
		if (slotIndex === null) return;
		const slot = SLOT_LABELS[slotIndex];
		if (!slot) return;
		device.setActiveSlot(slot);
		uiStore.activeSlot = slot;
		if (device.status === 'connected') {
			applySlotResult(await slotsStore.loadSlot(slot));
		}
	});

	watch(hardwareVariationChange, (change) => {
		if (!change) return;
		const changeSlot = (['A', 'B', 'C', 'D'] as const)[change.slot];
		if (changeSlot !== device.getActiveSlot) return;
		uiStore.variation = change.variation;
		const activePatch = slotsStore.slots[uiStore.activeSlot]?.patch;
		if (activePatch?.description) {
			activePatch.description.variation = change.variation;
		}
	});

	watch(
		cableVisibility,
		() => {
			updatePatchData(currentPatch.value?.description);
		},
		{ deep: true },
	);
</script>
