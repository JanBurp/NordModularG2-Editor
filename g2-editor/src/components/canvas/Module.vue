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
	import SvgGradientDefs from './SvgGradientDefs.vue';
	import { MODULE_COLORS } from '../../constants';
	import { getModule } from '../../renderer/nmg2mods';
	import { getParam, adsrT, adsrL, lfoP, rateBPM, rateLo, OscFreq, filterFreq, filterFreq1, filterFreq2 } from '../../renderer/parammap';
	import ModuleVeText from './ModuleVeText.vue';
	import ModuleVeLine from './ModuleVeLine.vue';
	import ModuleVePaths from './ModuleVePaths.vue';
	import ModuleVeLed from './ModuleVeLed.vue';
	import ModuleBitmap from './ModuleBitmap.vue';

	const paramFormattingFunctions: Record<string, (i: number) => string> = {
		adsrT,
		adsrL,
		lfoP,
		rateBPM,
		filterFreq,
		filterFreq1,
		filterFreq2,
	};

	const paramFormattingFunctionsWithArgs: Record<string, (i: number, con: unknown, tw: unknown) => string | undefined> = {
		OscFreq,
		rateLo,
	};

	interface ModuleInstance {
		horiz?: number;
		vert?: number;
		colour?: number;
		uname?: string | null;
		lv?: number[];
		modes?: number[];
	}

	interface VisualElement {
		type: string;
		x?: number;
		y?: number;
		x1?: number;
		y1?: number;
		x2?: number;
		y2?: number;
		w?: number;
		h?: number;
		t?: string;
		d?: string;
		id?: string;
		ref?: number | number[];
		cnt?: number;
		xo?: number;
	}

	interface ModuleParam {
		name: string;
		type: string;
		n: string;
		x: number;
		y: number;
	}

	interface ModuleMode {
		name: string;
		type: string;
		x: number;
		y: number;
		w?: number;
		h?: number;
	}

	interface ModuleInput {
		name: string;
		colour: string;
		x: number;
		y: number;
	}

	interface ModuleOutput {
		name: string;
		colour: string;
		x: number;
		y: number;
	}

	interface ModuleDefinition {
		id: number;
		short: string;
		long: string;
		height: number;
		inputs?: ModuleInput[];
		outputs?: ModuleOutput[];
		params?: ModuleParam[];
		modes?: ModuleMode[];
		ve?: VisualElement[];
	}

	const props = defineProps<{
		type: number;
		instance?: ModuleInstance;
	}>();

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number];
	}>();

	const instance = computed(() => props.instance || { colour: 0 });

	const moduleDef = computed<ModuleDefinition | null>(() => {
		return getModule(props.type) || null;
	});

	const x = computed(() => (instance.value.horiz || 0) * 256);
	const y = computed(() => (instance.value.vert || 0) * 16);
	const colour = computed(() => instance.value.colour || 0);

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

	const moduleColor = computed(() => MODULE_COLORS[colour.value] || MODULE_COLORS[0]);

	const displayName = computed(() => {
		return instance.value.uname || moduleDef.value?.short || 'Module';
	});

	const height = computed(() => {
		return (moduleDef.value?.height || 2) * 16;
	});

	// Helper functions for control types
	function isKnob(n: string): boolean {
		return ['KnobBig', 'KnobMedium', 'KnobSmall', 'KnobReset'].includes(n);
	}

	function isSlider(n: string): boolean {
		return ['KnobSlider', 'KnobSeqSlider'].includes(n);
	}

	function isSwitch(n: string): boolean {
		return n?.startsWith('SwM') || n === 'levelshift';
	}

	function isSpinner(n: string): boolean {
		return n === 'KnobSpin';
	}

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
		emit('paramChange', instance.value.index || 0, paramIndex, value);
	}

	// Get mode value from instance or default
	function getModeValue(index: number): number {
		if (instance.value.modes && instance.value.modes.length > index) {
			return instance.value.modes[index];
		}
		return 0;
	}

	// Format value for display
	function formatValue(value: number, paramType: string): string {
		const p = getParam(paramType);
		if (!p) return String(value);

		// Use formatting function if available
		if (p.f && paramFormattingFunctions[p.f]) {
			try {
				return paramFormattingFunctions[p.f](value) || String(value);
			} catch {
				return String(value);
			}
		}

		return String(value);
	}

	// Format combined value from multiple parameters (for freq displays)
	function formatCombinedValue(refIndices: number[], funcName?: string): string {
		// Get the first parameter's type for the formatting function
		const firstParam = moduleDef.value?.params?.[refIndices[0]];
		if (!firstParam) return '';

		const p = getParam(firstParam.type);
		if (!p) return '';

		// Use explicit func name or the param type's formatting function
		const formatFunc = funcName || p.f;

		if (formatFunc && paramFormattingFunctionsWithArgs[formatFunc]) {
			try {
				// Build controls array - all params need .l property with their value
				const controls: { l: number; p: unknown }[] = [];

				// Populate controls for all module params (formatters may reference any param)
				moduleDef.value?.params?.forEach((param, idx) => {
					controls[idx] = {
						l: getParamValue(idx),
						p: getParam(param.type),
					};
				});

				// Create tw object with ca array pointing to our ref indices
				// The formatter uses con[tw.ca[0]].l, con[tw.ca[1]].l, etc.
				const tw = {
					ca: refIndices, // Control indices the formatter should use
				};

				// Call formatter - first arg is ignored (index), second is controls array, third is tw
				const result = paramFormattingFunctionsWithArgs[formatFunc](0, controls, tw);

				if (result && result !== 'undefined') {
					return result;
				}

				// If formatter returned empty/undefined, fallback to simple display
				return refIndices.map((idx) => getParamValue(idx)).join(' ');
			} catch (e) {
				console.error('Format error:', formatFunc, e);
				return refIndices.map((idx) => getParamValue(idx)).join(' ');
			}
		}

		// Fallback: just show all values
		return refIndices.map((idx) => getParamValue(idx)).join(' ');
	}
</script>

<template>
	<g v-if="moduleDef" :transform="`translate(${x}, ${y})`" class="module">
		<SvgGradientDefs />

		<ModuleBackground :height="height"></ModuleBackground>

		<ModuleTitle :displayName="displayName" :type="type"></ModuleTitle>

		<!-- Modes -->
		<g class="modes">
			<ModuleMode
				v-for="(mode, index) in moduleDef.modes"
				:key="mode.name"
				:x="mode.x"
				:y="mode.y"
				:width="mode.w || 20"
				:height="mode.h || 18"
				:param-type="mode.type"
				:value="getModeValue(index)"
			/>
		</g>

		<!-- Visual elements from ve array -->
		<template v-for="(ve, index) in moduleDef.ve" :key="`ve-${index}`">
			<ModuleVeText v-if="ve.type === 'text'" :ve="ve"></ModuleVeText>
			<ModuleVeLine v-else-if="ve.type === 'line'" :ve="ve"></ModuleVeLine>
			<ModuleVePaths v-else-if="ve.type === 'path'" :ve="ve"></ModuleVePaths>
			<ModuleGraph
				v-else-if="(ve.type === 'graph' || ve.type === 'graphenv') && ve.w && ve.h"
				:type="ve.type"
				:x="ve.x"
				:y="ve.y"
				:w="ve.w"
				:h="ve.h"
				:f="ve.f"
				:lv="localLv"
				:module-id="props.type"
			/>

			<!-- Value displays with formatted text -->
			<template v-else-if="ve.type === 'valueDisplay' && ve.w">
				<rect :x="ve.x" :y="ve.y" :width="ve.w" height="14" fill="#666" />
				<!-- Show formatted value if ref points to a param -->
				<text v-if="ve.ref !== undefined" :x="(ve.x || 0) + (ve.w || 0) / 2" :y="(ve.y || 0) + 10" fill="#fff" font-size="8" text-anchor="middle">
					<template v-if="typeof ve.ref === 'number'">
						{{ formatValue(getParamValue(ve.ref), moduleDef?.params?.[ve.ref]?.type || '') }}
					</template>
					<template v-else-if="Array.isArray(ve.ref)">
						{{ formatCombinedValue(ve.ref, ve.func) }}
					</template>
				</text>
			</template>

			<ModuleVeLed v-else-if="ve.type === 'led' || ve.type === 'ledArray'" :ve="ve"></ModuleVeLed>
			<ModuleBitmap v-else-if="ve.type === 'bmp'" :ve="ve"></ModuleBitmap>
		</template>

		<!-- Parameters -->
		<g class="params">
			<template v-for="(param, index) in moduleDef.params" :key="param.name">
				<!-- Knobs -->
				<ModuleKnob
					v-if="isKnob(param.n)"
					:type="param.n"
					:x="param.x"
					:y="param.y"
					:value="getParamValue(index)"
					:param-index="index"
					@change="onParamChange"
				/>

				<!-- Sliders -->
				<ModuleSlider
					v-else-if="isSlider(param.n)"
					:x="param.x"
					:y="param.y"
					:value="getParamValue(index)"
					:param-index="index"
					@change="onParamChange"
				/>

				<!-- Switches -->
				<ModuleSwitch
					v-else-if="isSwitch(param.n)"
					:x="param.x"
					:y="param.y"
					:param-type="param.type"
					:value="getParamValue(index)"
					:param-index="index"
					@change="onParamChange"
				/>

				<!-- Spinners (KnobSpin) - render as small knob for now -->
				<ModuleKnob
					v-else-if="isSpinner(param.n)"
					type="KnobSmall"
					:x="param.x"
					:y="param.y"
					:value="getParamValue(index)"
					:param-index="index"
					@change="onParamChange"
				/>
			</template>
		</g>

		<!-- Input jacks -->
		<ModuleJack
			v-for="input in moduleDef.inputs"
			:key="`in-${input.name}`"
			:name="input.name"
			:colour="input.colour"
			:x="input.x"
			:y="input.y"
			type="input"
		/>

		<!-- Output jacks -->
		<ModuleJack
			v-for="output in moduleDef.outputs"
			:key="`out-${output.name}`"
			:name="output.name"
			:colour="output.colour"
			:x="output.x"
			:y="output.y"
			type="output"
		/>
	</g>
	<g v-else :transform="`translate(${x}, ${y})`">
		<rect width="256" height="32" fill="#666" stroke="#333" rx="2" />
		<text x="128" y="20" fill="#fff" font-size="10" text-anchor="middle"> Unknown Module ({{ type }}) </text>
	</g>
</template>

<style scoped>
	.module {
		cursor: default;
		color: v-bind(moduleColor);
	}
</style>
