<template>
	<div class="flex flex-col h-screen">
		<ToolBar>
			<Button variant="file" accept=".pch2,.prf2" @change="handleFileLoad"
				>Load Patch</Button
			>
			<Button variant="default" :disabled="!patch">Save Patch</Button>
			<Button
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
			</Button>

			<ToolBarDivider />

			<span
				class="ml-auto text-xs text-neutral-500"
				:class="{ 'text-green-600': deviceStatus === 'connected' }"
			>
				{{ statusText }}
			</span>

			<Button
				v-if="deviceStatus === 'connected'"
				variant="default"
				@click="disconnectDevice"
			>
				Disconnect
			</Button>
			<Button
				v-else
				variant="default"
				:disabled="deviceStatus === 'connecting'"
				@click="connectDevice"
			>
				{{ deviceStatus === "connecting" ? "Connecting..." : "Connect G2" }}
			</Button>

			<ToolBarDivider />

			<BtnGroup
				:model-value="rightPaneTab"
				:options="[
					{ label: 'USB', value: 'usb' },
					{ label: 'Browser', value: 'browser' },
					{ label: 'Modules', value: 'modules' },
					{ label: 'Data', value: 'data', disabled: !patch },
				]"
				variant="tab"
				@update:model-value="toggleSidebar"
				@toggle-off="handleToggleOff"
			/>
		</ToolBar>

		<ToolBar v-if="patchName">
			<span class="text-xs font-semibold text-neutral-400">{{
				patchName
			}}</span>

			<div class="flex items-center gap-1.5">
				<span class="text-xs font-semibold text-neutral-400">Cat:</span>
				<select
					v-model="selectedCategory"
					class="h-6 px-2 text-xs border border-neutral-500 rounded bg-gray-100 text-gray-800 cursor-pointer min-w-24 hover:bg-gray-200 focus:outline-none focus:border-neutral-600 focus:shadow"
					title="Sound Category"
				>
					<option v-for="cat in soundCategories" :key="cat.id" :value="cat.id">
						{{ cat.name }}
					</option>
				</select>
			</div>

			<ToolBarDivider />

			<span class="text-xs text-neutral-600">
				Voice: {{ areaModulesCount("voice") }} modules,
				{{ areaCablesCount("voice") }} cables<br />
				FX: {{ areaModulesCount("fx") }} modules,
				{{ areaCablesCount("fx") }} cables<br />
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
						:class="{ 'opacity-100 shadow-sm': cableVisibility[color.name] }"
						:style="{ backgroundColor: color.hex, borderColor: color.hex }"
						:title="
							color.label +
							(cableVisibility[color.name] ? ' (visible)' : ' (hidden)')
						"
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
						:class="{
							'bg-gray-500 border-neutral-500 text-white shadow':
								allCablesVisible,
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
					v-if="patch"
					:key="patchName"
					:modules="currentModules"
					:cables="currentCables"
					:variation="variation"
					:area="selectedArea"
					:cable-visibility="cableVisibility"
					:shake-trigger="cableShakeTrigger"
				/>
				<div
					v-else
					class="flex items-center justify-center h-full text-neutral-500 text-sm"
				>
					Load a .pch2 or .prf2 file to begin
				</div>
			</div>

			<div
				v-if="showRightPane"
				class="w-72 bg-neutral-800 border-l border-neutral-700 flex flex-col"
			>
				<div class="flex-1 overflow-hidden p-3">
					<UsbPanel
						v-show="rightPaneTab === 'usb'"
						:logs="usbLogs"
						:device-status="deviceStatus"
						@disconnect="disconnectDevice"
						@connect="connectDevice"
						@clear-logs="clearLogs"
					/>
					<PatchBrowser
						v-show="rightPaneTab === 'browser'"
						:isActive="rightPaneTab === 'browser'"
						@select="handlePatchSelect"
					/>
					<PatchData v-show="rightPaneTab === 'data' && patch" :patch="patch" />
					<ModulesPane
						v-show="rightPaneTab === 'modules'"
						:isActive="rightPaneTab === 'modules'"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { watch } from "vue";
import "./renderer/nmg2mods.js";
import "./renderer/parammap.js";
import "./parser/nmg2PatchParser.js";
import PatchCanvas from "./components/canvas/PatchCanvas.vue";
import PatchBrowser from "./components/panels/PatchBrowser.vue";
import PatchData from "./components/panels/PatchData.vue";
import ModulesPane from "./components/panels/ModulesPane.vue";
import UsbPanel from "./components/panels/UsbPanel.vue";
import Button from "./components/toolbar/Button.vue";
import BtnGroup from "./components/toolbar/BtnGroup.vue";
import ToolBar from "./components/toolbar/ToolBar.vue";
import ToolBarDivider from "./components/toolbar/ToolBarDivider.vue";

import { usePatchManager } from "./composables/usePatchManager";
import { useG2Connection } from "./composables/useG2Connection";
import { useCableVisibility } from "./composables/useCableVisibility";
import { usePatchCategory } from "./composables/usePatchCategory";
import { useRightPanel } from "./composables/useRightPanel";

import { SOUND_CATEGORIES as soundCategories } from "./constants";

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
} = usePatchManager();

const {
	g2,
	deviceStatus,
	statusText,
	usbLogs,
	connectDevice,
	disconnectDevice,
	uploadToG2,
	downloadFromG2,
	clearLogs,
} = useG2Connection();

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

const { rightPaneTab, showRightPane, toggleSidebar, handleToggleOff } =
	useRightPanel();

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
