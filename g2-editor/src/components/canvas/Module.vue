<template>
	<g
		v-if="moduleDef"
		:transform="`translate(${x}, ${y})`"
		class="cursor-default"
		:class="{ selected: isSelected }"
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
			<ModuleValueDisplay v-else-if="entry.ve.type === 'valueDisplay'" :ve="entry.ve" :params="moduleDef.params || []" :values="localLv" :modes="instance.modes" :modeDefs="moduleDef.modes || []" />
			<ModuleVeLed
				v-else-if="entry.ve.type === 'led' || entry.ve.type === 'ledArray'"
				:ve="entry.ve"
				:area="props.areaLabel || 'fx'"
				:module-index="instance.index"
				:group-id="entry.groupId"
			></ModuleVeLed>
			<ModuleBitmap v-else-if="entry.ve.type === 'bmp'" :ve="entry.ve"></ModuleBitmap>
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
		<g class="params">
			<template v-for="(param, index) in moduleDef.params" :key="param.name">
				<ModuleKnob v-if="isKnob(param.n)" :param="param" :value="getParamValue(index)" :param-index="index" @change="onParamChange" />
				<ModuleSlider v-else-if="isSlider(param.n)" :param="param" :value="getParamValue(index)" :param-index="index" @change="onParamChange" />
				<ModuleSwitch
					v-else-if="isSwitch(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:label="getParamLabel(index)"
					:param-index="index"
					@change="onParamChange"
					@param-label-edit="(info) => emit('paramLabelEdit', { moduleIndex: moduleIdx, ...info })"
				/>
				<ModuleKnobSpin v-else-if="isSpinner(param.n)" :param="param" :value="getParamValue(index)" :param-index="index" @change="onParamChange" />
				<ModuleKnobSpinH v-else-if="isSpinnerH(param.n)" :param="param" :value="getParamValue(index)" :param-index="index" @change="onParamChange" />
			</template>
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
	import { computed, ref, watch } from 'vue';
	import ModuleBackground from './ModuleBackground.vue';
	import ModuleKnob from './ModuleKnob.vue';
	import ModuleTitle from './ModuleTitle.vue';
	import ModuleSlider from './ModuleSlider.vue';
	import ModuleSwitch from './ModuleSwitch.vue';
	import ModuleMode from './ModuleMode.vue';
	import ModuleJack from './ModuleJack.vue';
	import ModuleGraph from './ModuleGraph.vue';
	import { getModule } from '../../renderer/nmg2mods';
	import { getParam } from '../../renderer/parammap';
	import { isKnob, isSlider, isSwitch, isSpinner, isSpinnerH } from '../../composables/useModuleControls';
	import ModuleVeText from './ModuleVeText.vue';
	import ModuleVeLine from './ModuleVeLine.vue';
	import ModuleVePaths from './ModuleVePaths.vue';
	import ModuleVeLed from './ModuleVeLed.vue';
	import ModuleBitmap from './ModuleBitmap.vue';
	import ModuleValueDisplay from './ModuleValueDisplay.vue';
	import ModuleKnobSpin from './ModuleKnobSpin.vue';
	import ModuleKnobSpinH from './ModuleKnobSpinH.vue';
	import type { ModuleInstance, ModuleDefinition, JackDragInfo, ParamLabel } from '../../types';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { buildColorSwatches } from '../../composables/useColorSwatches';

	const props = defineProps<{
		instance?: ModuleInstance;
		isSelected?: boolean;
		connectedInputs?: Set<number>;
		connectedOutputs?: Set<number>;
		areaLabel?: 'fx' | 'va';
	}>();

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number];
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

	function onModuleClick(e: MouseEvent) {
		if (e.altKey) onContextMenu(e);
	}

	function onContextMenu(e: MouseEvent) {
		openContextMenu(e, [
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
		const entries: { ve: any; groupId: number; key: string }[] = [];
		let ledIdx = 0;
		let ledArrayIdx = 0;
		let veIdx = 0;
		for (const ve of moduleDef.value.ve) {
			if (ve.type === 'led') {
				entries.push({ ve, groupId: ledIdx, key: `led-${ledIdx}` });
				ledIdx++;
			} else if (ve.type === 'ledArray') {
				entries.push({ ve, groupId: ledArrayIdx, key: `ledArray-${ledArrayIdx}` });
				ledArrayIdx++;
			} else {
				entries.push({ ve, groupId: 0, key: `ve-${veIdx}` });
				veIdx++;
			}
		}
		return entries;
	});

	const x = computed(() => (instance.value.horiz || 0) * 256);
	const y = computed(() => (instance.value.vert || 0) * 16);

	// Reactive local parameter values
	const localLv = ref<number[]>([]);

	// Initialize localLv from instance
	watch(
		() => instance.value.lv,
		(newLv) => {
			if (newLv) {
				localLv.value = [...newLv];
			} else {
				// Initialize with defaults
				localLv.value =
					moduleDef.value?.params?.map((param) => {
						const p = getParam(param.type);
						return p?.def ?? 64;
					}) || [];
			}
		},
		{ immediate: true },
	);

	const displayName = computed(() => {
		return instance.value.uname || moduleDef.value?.short || 'Module';
	});

	const height = computed(() => {
		return (moduleDef.value?.height || 2) * 16;
	});

	// Get parameter value from localLv or default
	function getParamValue(index: number): number {
		if (localLv.value.length > index) {
			return localLv.value[index];
		}
		// Return default from paramMap
		const param = moduleDef.value?.params?.[index];
		if (param) {
			const p = getParam(param.type);
			return p?.def ?? 64;
		}
		return 64;
	}

	function getParamLabel(index: number): ParamLabel | undefined {
		if (typeof instance.value.paramLabels === 'undefined' || instance.value.paramLabels?.length === 0) return undefined;
		const idx = instance.value.paramLabels.findIndex((label) => label.paramIndex === index);
		if (idx < 0) return undefined;
		return instance.value.paramLabels[idx];
	}

	// Handle parameter change from controls
	function onParamChange(paramIndex: number, value: number) {
		// Clamp to param's valid range
		const param = moduleDef.value?.params?.[paramIndex];
		if (param) {
			const p = getParam(param.type);
			if (p) {
				value = Math.min(Math.max(value, p.low), p.high);
			}
		}
		// Update local state
		localLv.value[paramIndex] = value;

		// Emit to parent
		emit('paramChange', moduleIdx.value, paramIndex, value);
	}

	// Get mode value from instance or default
	function getModeValue(index: number): number {
		if (instance.value.modes && instance.value.modes.length > index) {
			return instance.value.modes[index];
		}
		return 0;
	}

	// Handle parameter change from mode controls
	function onModeChange(index: number, value: number) {
		// Update local state
		if (instance.value.modes && instance.value.modes.length > index) {
			instance.value.modes[index] = value;
		}
		// Emit to parent
		emit('modeChange', moduleIdx.value, index, value);
	}
</script>
