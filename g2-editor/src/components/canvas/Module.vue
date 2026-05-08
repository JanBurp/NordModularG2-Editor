<template>
	<g v-if="moduleDef" :transform="`translate(${x}, ${y})`" class="cursor-default" :class="{ selected: isSelected }" @click.stop @mousedown.stop>
		<ModuleBackground :height="height" :colour="instance.colour || 0"></ModuleBackground>
		<ModuleTitle :displayName="displayName" :is-name="instance.type == 126" :selected="isSelected"></ModuleTitle>

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
		<template v-for="(ve, index) in moduleDef.ve" :key="`ve-${index}`">
			<ModuleVeText v-if="ve.type === 'text'" :ve="ve"></ModuleVeText>
			<ModuleVeLine v-else-if="ve.type === 'line'" :ve="ve"></ModuleVeLine>
			<ModuleVePaths v-else-if="ve.type === 'path'" :ve="ve"></ModuleVePaths>
			<ModuleGraph v-else-if="(ve.type === 'graph' || ve.type === 'graphenv') && ve.w && ve.h" :ve="ve" :lv="localLv" :module-id="instance.type" />
			<ModuleValueDisplay v-else-if="ve.type === 'valueDisplay'" :ve="ve" :params="moduleDef.params || []" :values="localLv" />
			<ModuleVeLed v-else-if="ve.type === 'led' || ve.type === 'ledArray'" :ve="ve"></ModuleVeLed>
			<ModuleBitmap v-else-if="ve.type === 'bmp'" :ve="ve"></ModuleBitmap>
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
				<ModuleSwitch v-else-if="isSwitch(param.n)" :param="param" :value="getParamValue(index)" :param-index="index" @change="onParamChange" />
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
			@jackDragStart="(info) => emit('jackDragStart', info)"
			@jackDragEnd="(info) => emit('jackDragEnd', info)"
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
			@jackDragStart="(info) => emit('jackDragStart', info)"
			@jackDragEnd="(info) => emit('jackDragEnd', info)"
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
	import type { ModuleInstance, ModuleDefinition, JackDragInfo } from '../../types';

	const props = defineProps<{
		instance?: ModuleInstance;
		isSelected?: boolean;
	}>();

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number];
		modeChange: [moduleIndex: number, index: number, value: number];
		jackDragStart: [info: JackDragInfo];
		jackDragEnd: [info: JackDragInfo];
		moduleDragStart: [info: { moduleIndex: number; clientX: number; clientY: number }];
		moduleLabelEdit: [info: { moduleIndex: number; currentLabel: string }];
	}>();

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

	const instance = computed(() => props.instance || { type: -1, colour: 0 });
	const moduleIdx = computed(() => instance.value.index || 0);

	const moduleDef = computed<ModuleDefinition | null>(() => {
		return getModule(instance.value.type) || null;
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

	// Handle parameter change from controls
	function onParamChange(paramIndex: number, value: number) {
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
