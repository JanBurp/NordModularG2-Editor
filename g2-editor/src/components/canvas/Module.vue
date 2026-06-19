<template>
	<g
		v-if="moduleDef"
		:transform="`translate(${x}, ${y})`"
		class="cursor-default"
		:class="{ selected: isSelected }"
		:data-module-idx="moduleIdx"
		:data-module-short="moduleDef.short"
		@click.stop="onModuleClick"
		@mousedown.stop
		@contextmenu.stop.prevent="onContextMenu"
	>
		<ModuleBackground :height="height" :colour="instance.colour || 0"></ModuleBackground>
		<ModuleTitle :displayName="displayName" :is-name="instance.type == 126" :selected="isSelected ?? false"></ModuleTitle>

		<!-- Drag handle: title row only, transparent, cursor grab -->
		<rect
			width="256"
			height="18"
			fill="transparent"
			style="cursor: grab"
			data-drag-handle="true"
			@mousedown.stop.prevent="onDragHandleMousedown"
			@dblclick.stop.prevent="onTitleDblClick"
		/>

		<!-- Visual elements from ve array -->
		<template v-for="entry in visualElementsGroupedLeds" :key="entry.key">
			<ModuleVeText v-if="entry.ve.type === 'text'" :ve="entry.ve"></ModuleVeText>
			<ModuleVeLine v-else-if="entry.ve.type === 'line'" :ve="entry.ve"></ModuleVeLine>
			<ModuleVePaths v-else-if="entry.ve.type === 'path'" :ve="entry.ve"></ModuleVePaths>
			<ModuleGraph
				v-else-if="(entry.ve.type === 'graph' || entry.ve.type === 'graphenv') && entry.ve.w && entry.ve.h"
				:ve="entry.ve"
				:lv="localLv"
				:modes="instance.modes"
				:module-id="instance.type"
			/>
			<ModuleValueDisplay
				v-else-if="entry.ve.type === 'valueDisplay'"
				:ve="entry.ve"
				:params="moduleDef.params || []"
				:values="localLv"
				:modes="instance.modes"
				:modeDefs="moduleDef.modes || []"
			/>
			<ModuleVeLed
				v-else-if="entry.ve.type === 'led' || entry.ve.type === 'ledArray'"
				:ve="entry.ve"
				:led-on="ledStateMap[entry.key]?.on ?? false"
				:active-step="ledStateMap[entry.key]?.step ?? 255"
			></ModuleVeLed>
			<ModuleBitmap v-else-if="entry.ve.type === 'bmp'" :ve="entry.ve"></ModuleBitmap>
			<LevelMeter v-else-if="entry.ve.type === 'vu'" :ve="entry.ve" :value="ledStateMap[entry.key]?.step ?? 0" />
			<ModuleVeLed v-else-if="entry.ve.type === 'ledGroup'" :ve="entry.ve" :led-on="false" :active-step="ledStateMap[entry.key]?.step ?? 255" />
		</template>

		<!-- Modes -->
		<g class="modes">
			<ModuleMode
				v-for="(mode, index) in moduleDef.modes"
				:key="mode.name"
				:mode="mode"
				:value="getModeValue(index)"
				:param-index="index"
				@change="onModeChange"
			/>
		</g>

		<!-- Parameters -->
		<g class="params" @dragover="onParamCCDragOver" @drop="onParamCCDrop">
			<g v-for="(param, index) in moduleDef.params" :key="param.name" :data-param-index="index">
				<ModuleKnob
					v-if="isKnob(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === selectedParamIndex"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
					/>
				<ModuleSlider
					v-else-if="isSlider(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === selectedParamIndex"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
					/>
				<ModuleSwitch
					v-else-if="isSwitch(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:label="getParamLabel(index)"
					:param-index="index"
					:highlight="index === selectedParamIndex"
					@change="onParamChange"
					@param-label-edit="(info) => emit('paramLabelEdit', { moduleIndex: moduleIdx, ...info })"
					@param-context-menu="onParamContextMenu"
					/>
				<ModuleKnobSpin
					v-else-if="isSpinner(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === selectedParamIndex"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
					/>
				<ModuleKnobSpinH
					v-else-if="isSpinnerH(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === selectedParamIndex"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
					/>
			</g>
		</g>

		<!-- Input jacks -->
		<ModuleJack
			v-for="(input, idx) in moduleDef.inputs"
			:key="`in-${input.name}`"
			:name="input.name"
			:colour="input.colour"
			:x="input.x"
			:y="input.y"
			type="input"
			:moduleIndex="moduleIdx"
			:connectorIndex="idx"
			:connected="connectedInputs?.has(idx)"
			@jackDragStart="(info) => emit('jackDragStart', info)"
			@jackDragEnd="(info) => emit('jackDragEnd', info)"
			@jackDeleteConnected="(info) => emit('jackDeleteConnected', info)"
			@jackSetCableColor="(info) => emit('jackSetCableColor', info)"
		/>

		<!-- Output jacks -->
		<ModuleJack
			v-for="(output, idx) in moduleDef.outputs"
			:key="`out-${output.name}`"
			:name="output.name"
			:colour="output.colour"
			:x="output.x"
			:y="output.y"
			type="output"
			:moduleIndex="moduleIdx"
			:connectorIndex="idx"
			:connected="connectedOutputs?.has(idx)"
			@jackDragStart="(info) => emit('jackDragStart', info)"
			@jackDragEnd="(info) => emit('jackDragEnd', info)"
			@jackDeleteConnected="(info) => emit('jackDeleteConnected', info)"
			@jackSetCableColor="(info) => emit('jackSetCableColor', info)"
		/>
	</g>
	<g v-else :transform="`translate(${x}, ${y})`">
		<rect width="256" height="32" fill="#666" stroke="#333" rx="2" />
		<text x="128" y="20" fill="#fff" font-size="10" text-anchor="middle"> Unknown Module ({{ instance.type }}) </text>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { useUiStore } from '../../store/ui';
	import ModuleBackground from './ModuleBackground.vue';
	import ModuleKnob from './ModuleKnob.vue';
	import ModuleTitle from './ModuleTitle.vue';
	import ModuleSlider from './ModuleSlider.vue';
	import ModuleSwitch from './ModuleSwitch.vue';
	import ModuleMode from './ModuleMode.vue';
	import ModuleJack from './ModuleJack.vue';
	import ModuleGraph from './ModuleGraph.vue';
	import { getModule } from '../../renderer/nmg2mods';
	import { isKnob, isSlider, isSwitch, isSpinner, isSpinnerH } from '../../utils/moduleControls';
	import { getParam } from '../../renderer/parammap';
	import { useModuleParams } from '../../composables/useModuleParams';
	import ModuleVeText from './ModuleVeText.vue';
	import ModuleVeLine from './ModuleVeLine.vue';
	import ModuleVePaths from './ModuleVePaths.vue';
	import ModuleVeLed from './ModuleVeLed.vue';
	import ModuleBitmap from './ModuleBitmap.vue';
	import LevelMeter from './LevelMeter.vue';
	import ModuleValueDisplay from './ModuleValueDisplay.vue';
	import ModuleKnobSpin from './ModuleKnobSpin.vue';
	import ModuleKnobSpinH from './ModuleKnobSpinH.vue';
	import type { ModuleInstance, ModuleDefinition, JackDragInfo } from '../../types';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useParamEditDialog } from '../../composables/useParamEditDialog';
	import { buildColorSwatches } from '../../utils/colorSwatches';
	import { useLedStore } from '../../store/led';
	import { useSlotsStore } from '../../store/slots';
	import { useDeviceStore } from '../../store/device';
	import { ccLabel, getAllowedCCs } from '../../composables/useMidiCC';

	const props = defineProps<{
		instance?: ModuleInstance;
		isSelected?: boolean;
		connectedInputs?: Set<number>;
		connectedOutputs?: Set<number>;
		areaLabel?: 'fx' | 'va';
	}>();

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number, immediate?: boolean];
		modeChange: [moduleIndex: number, index: number, value: number];
		jackDragStart: [info: JackDragInfo];
		jackDragEnd: [info: JackDragInfo];
		moduleDragStart: [info: { moduleIndex: number; clientX: number; clientY: number }];
		moduleLabelEdit: [info: { moduleIndex: number; currentLabel: string }];
		moduleDelete: [moduleIndex: number];
		moduleColorChange: [moduleIndex: number, colourId: number];
		jackDeleteConnected: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackSetCableColor: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colorId: number }];
		paramLabelEdit: [info: { moduleIndex: number; paramIndex: number; currentLabel: string }];
	}>();

	const { open: openContextMenu } = useContextMenu();
	const { handleParamDblClick } = useParamEditDialog();

	function onModuleClick(e: MouseEvent) {
		if (e.altKey) onContextMenu(e);
	}

	function onContextMenu(e: MouseEvent) {
		openContextMenu(e, [
			{ label: 'Show Help', action: () => uiStore.showModuleHelp(instance.value.type) },
			{ type: 'separator' },
			{ label: 'Rename…', action: () => onTitleDblClick() },
			{ type: 'separator' },
			{ label: 'Delete', action: () => emit('moduleDelete', moduleIdx.value) },
			{ type: 'separator' },
			{
				label: 'Set Color',
				children: [{ type: 'swatches', swatches: buildColorSwatches((id) => emit('moduleColorChange', moduleIdx.value, id)) }],
			},
		]);
	}

	function onDragHandleMousedown(e: MouseEvent) {
		emit('moduleDragStart', {
			moduleIndex: moduleIdx.value,
			clientX: e.clientX,
			clientY: e.clientY,
		});
	}

	function onTitleDblClick() {
		emit('moduleLabelEdit', {
			moduleIndex: moduleIdx.value,
			currentLabel: displayName.value,
		});
	}

	const instance = computed(() => props.instance as ModuleInstance);
	const moduleIdx = computed(() => instance.value.index || 0);

	const moduleDef = computed<ModuleDefinition | null>(() => {
		return getModule(instance.value.type) || null;
	});

	const visualElementsGroupedLeds = computed(() => {
		if (!moduleDef.value?.ve) return [];
		const entries: { ve: any; key: string }[] = [];
		let ledIdx = 0;
		let ledArrayIdx = 0;
		let vuIdx = 0;
		let ledGroupIdx = 0;
		let veIdx = 0;
		for (const ve of moduleDef.value.ve) {
			if (ve.type === 'led') {
				entries.push({ ve, key: `led-${ledIdx}` });
				ledIdx++;
			} else if (ve.type === 'ledArray') {
				entries.push({ ve, key: `ledArray-${ledArrayIdx}` });
				ledArrayIdx++;
			} else if (ve.type === 'vu') {
				entries.push({ ve, key: `vu-${vuIdx}` });
				vuIdx++;
			} else if (ve.type === 'ledGroup') {
				entries.push({ ve, key: `ledGroup-${ledGroupIdx}` });
				ledGroupIdx++;
			} else {
				entries.push({ ve, key: `ve-${veIdx}` });
				veIdx++;
			}
		}
		return entries;
	});

	const ledStore = useLedStore();
	const ledStateMap = computed(() => {
		const area = props.areaLabel || 'fx';
		const idx = moduleIdx.value;
		const map: Record<string, { on: boolean; step: number }> = {};
		for (const entry of visualElementsGroupedLeds.value) {
			if (entry.ve.type === 'led' || entry.ve.type === 'ledArray' || entry.ve.type === 'vu' || entry.ve.type === 'ledGroup') {
				map[entry.key] = {
					on: ledStore.getLedState(area, idx, entry.key),
					step: ledStore.getStripValue(area, idx, entry.key),
				};
			}
		}
		return map;
	});

	const x = computed(() => (instance.value.horiz || 0) * 256);
	const y = computed(() => (instance.value.vert || 0) * 16);

	const displayName = computed(() => {
		if (typeof instance.value.uname !== 'undefined') return instance.value.uname;
		return moduleDef.value?.short || 'Module';
	});

	const height = computed(() => {
		return (moduleDef.value?.height || 2) * 16;
	});

	const { localLv, getParamValue, getParamLabel, onParamChange, getModeValue, onModeChange } = useModuleParams(
		instance,
		moduleDef,
		props.areaLabel ?? 'fx',
		(moduleIndex, paramIndex, value, immediate) => emit('paramChange', moduleIndex, paramIndex, value, immediate),
		(moduleIndex, index, value) => emit('modeChange', moduleIndex, index, value),
	);

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const deviceStore = useDeviceStore();

	const selectedParamIndex = computed(() => {
		if (uiStore.selectedModulesArea !== props.areaLabel) return -1;
		return uiStore.selectedParam?.moduleId === moduleIdx.value ? uiStore.selectedParam.paramIndex : -1;
	});

	function onParamCCDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function onParamCCDrop(e: DragEvent) {
		const raw = e.dataTransfer?.getData('text/plain');
		if (!raw) return;
		let data: any;
		try { data = JSON.parse(raw); } catch { return; }
		if (data.type !== 'cc') return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		let el = e.target as Element | null;
		while (el && !el.hasAttribute('data-param-index')) el = el.parentElement;
		if (!el) return;
		const paramIndex = parseInt(el.getAttribute('data-param-index') ?? '');
		if (isNaN(paramIndex)) return;
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;
		slotsStore.assignMidiCC(slot, location, moduleIdx.value, paramIndex, data.cc);
	}

	function onParamContextMenu(paramIndex: number, event: MouseEvent) {
		const param = moduleDef.value?.params?.[paramIndex];
		const slot = uiStore.slotInFocus;
		const location = props.areaLabel === 'va' ? 1 : 0;
		const items: any[] = [];

		// MIDI CC items
		const lastCC = deviceStore.lastMidiCC;
		items.push({
			label: lastCC !== null ? `Assign CC (${lastCC})` : 'Assign CC (none)',
			disabled: lastCC === null || !slot,
			action: () => slot && slotsStore.assignMidiCC(slot, location as 0 | 1, moduleIdx.value, paramIndex, lastCC!),
		});
		items.push({
			label: 'Assign CC…',
			children: getAllowedCCs().map((cc) => ({
				label: ccLabel(cc),
				action: () => slot && slotsStore.assignMidiCC(slot, location as 0 | 1, moduleIdx.value, paramIndex, cc),
			})),
		});
		items.push({ type: 'separator' });

		if (param && isSwitch(param.n)) {
			if (getParam(param.type)?.canLabel) {
				const label = getParamLabel(paramIndex);
				items.push({ label: 'Rename label', action: () =>
					emit('paramLabelEdit', { moduleIndex: moduleIdx.value, paramIndex, currentLabel: label?.labels?.[0] ?? '' })
				});
			}
		} else {
			items.push({ label: 'Set Value', action: () => {
				const paramType = param?.type ?? '';
				const currentValue = getParamValue(paramIndex);
				handleParamDblClick({ moduleIndex: moduleIdx.value, paramIndex, paramType, currentValue, area: props.areaLabel ?? 'fx' });
			}});
		}
		openContextMenu(event, items);
	}

</script>
