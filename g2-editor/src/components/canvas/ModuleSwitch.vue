<template>
	<g :transform="`translate(${param.x}, ${param.y})`" class="switch-control">
		<!-- Bitmap-based switch -->
		<template v-if="hasBitmap">
			<!-- Single button mode: show active bitmap with highlight -->
			<svg v-if="singleButtonMode && displayNames.length <= 1" :x="0" :y="0" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
				<rect x="0" y="0" :width="width" height="11" :fill="activeIndex === 1 ? '#6df2f2' : '#CCC'" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :clip-path="`url(#clip-${param.n}-0)`" />
			</svg>

			<!-- Single button mode: show active bitmap without highlight -->
			<svg v-else-if="singleButtonMode && displayNames.length > 1" :x="0" :y="0" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
				<rect x="0" y="0" :width="width" height="11" fill="#EEE" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :transform="`translate(0,${-(activeIndex * maskh)})`" :clip-path="`url(#clip-${param.n}-0)`" />
			</svg>

			<!-- VR/HR mode: show all bitmaps with active highlighted -->
			<svg
				v-else
				v-for="(name, index) in displayNames"
				:key="index"
				:x="getButtonX(index)"
				:y="getButtonY(index)"
				:width="width"
				height="11"
				class="switch-bitmap"
				:class="{ active: index === activeIndex }"
				@click="onButtonClick(index)"
			>
				<rect x="0" y="0" :width="width" height="11" :fill="index === activeIndex ? '#6df2f2' : '#CCC'" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :transform="`translate(${-(index * width)}, 0)`" :clip-path="`url(#clip-${param.n}-${index})`" />
			</svg>
		</template>

		<!-- Text-based switch -->
		<template v-else>
			<!-- Single button mode, with one displayname: show with highlight -->
			<g v-if="singleButtonMode && displayNames.length <= 1" class="switch-button" @click="onCycleValue">
				<rect :x="0" :y="0" :width="width" height="11" stroke="#333" :fill="activeIndex === 1 ? '#6df2f2' : '#CCC'" />
				<text :x="width / 2" :y="9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ activeOptionName }}
				</text>
			</g>

			<!-- Single button mode: show only active option without highlight -->
			<g v-else-if="singleButtonMode && displayNames.length > 1" class="switch-button" @click="onCycleValue">
				<rect :x="0" :y="0" :width="width" height="11" stroke="#333" fill="#EEE" />
				<text :x="width / 2" :y="9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ activeOptionName }}
				</text>
			</g>

			<!-- VR/HR mode: show all options with active highlighted -->
			<g
				v-else
				v-for="(name, index) in displayNames"
				:key="index"
				class="switch-button"
				:class="{ active: index === activeIndex }"
				@click="onButtonClick(index)"
			>
				<rect
					:x="getButtonX(index)"
					:y="getButtonY(index)"
					:width="width"
					height="11"
					:fill="index === activeIndex ? '#6df2f2' : '#CCC'"
					stroke="#333"
				/>
				<text :x="getButtonX(index) + width / 2" :y="getButtonY(index) + 9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ name }}
				</text>
			</g>
		</template>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { getParam } from '../../renderer/parammap';
	import type { ModuleParam, ParamDefinition, ParamLabel } from '../../types';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		label?: ParamLabel;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const paramDef = computed<ParamDefinition>(() => {
		return getParam(props.param.type) || ({} as ParamDefinition);
	});

	const names = computed(() => paramDef.value.names || []);
	const defin = computed(() => paramDef.value.defin || []);
	const width = computed(() => props.param.w || paramDef.value.width || 18);
	const mode = computed(() => paramDef.value.mode);
	const rows = computed(() => paramDef.value.rows || 1);
	const bmp = computed(() => paramDef.value.bmp);
	const hasBitmap = computed(() => !!bmp.value);
	const maskh = computed(() => paramDef.value.maskh || 11);

	const optionNames = computed(() => {
		const def = defin.value;
		if (def && def.length > 0) {
			const options = def[0].split(',').map((s) => {
				const parts = s.split('~');
				return parts.length >= 2 ? parts[1].trim() : s.trim();
			});
			if (options.length > 0 && options[0] !== '') return options;
		}
		return names.value;
	});

	const displayNames = computed(() => {
		if (props.label) return props.label.labels;
		if (names.value[0] === 'Ch#' && [props.param.name][0]) {
			const name = [props.param.name][0];
			const last = name.substring(name.length - 1);
			// @ts-ignore
			if (!isNaN(last)) {
				return ['Ch ' + last];
			}
		}
		if (names.value.length === 1) {
			if (names.value[0] === '') return '';
			return [props.param.name];
		}
		if (names.value && names.value.length > 0) {
			return names.value;
		}
		return optionNames.value;
	});

	const itemsPerRow = computed(() => {
		return Math.ceil(names.value.length / rows.value);
	});

	const activeIndex = computed(() => {
		const low = paramDef.value.low || 0;
		const high = paramDef.value.high || names.value.length - 1 || 0;
		// Clamp value to valid range
		return Math.max(low, Math.min(props.value, high));
	});

	const singleButtonMode = computed(() => {
		return mode.value !== 'VR' && mode.value !== 'HR';
	});

	const activeOptionName = computed(() => {
		const idx = activeIndex.value;
		return displayNames.value[idx] ?? displayNames.value[0];
	});

	function getButtonX(index: number): number {
		if (mode.value === 'VR') {
			// Vertical: all in one column
			return 0;
		}
		// Horizontal or default
		const col = index % itemsPerRow.value;
		return col * width.value;
	}

	function getButtonY(index: number): number {
		if (mode.value === 'VR') {
			// Vertical: stack vertically
			return index * 11;
		}
		if (mode.value === 'HR') {
			// Horizontal
			const row = Math.floor(index / itemsPerRow.value);
			return row * 11;
		}
		return 0;
	}

	function onButtonClick(index: number) {
		if (mode.value !== 'VR' && mode.value !== 'HR') {
			onCycleValue();
		} else {
			const low = paramDef.value.low || 0;
			const high = paramDef.value.high || names.value.length - 1 || 0;

			// Ensure value is within bounds
			const newValue = Math.max(low, Math.min(index, high));

			if (newValue !== props.value) {
				emit('change', props.paramIndex, newValue);
			}
		}
	}

	function onCycleValue() {
		// Cycle to next value (for single-button switches)
		const low = paramDef.value.low || 0;
		const high = paramDef.value.high || names.value.length - 1 || 0;
		const range = high - low + 1;

		const current = Math.max(low, Math.min(props.value, high));
		const newValue = low + ((current - low + 1) % range);

		emit('change', props.paramIndex, newValue);
	}
</script>
<style scoped>
	.switch-control {
		user-select: none;
	}

	.switch-bitmap {
		cursor: pointer;
		overflow: hidden;
	}

	.switch-bitmap:hover {
		opacity: 0.8;
	}

	.switch-bitmap.active {
		filter: brightness(1.2);
	}

	.switch-button {
		cursor: pointer;
	}

	.switch-button:hover rect {
		stroke: #666;
		stroke-width: 1;
	}

	.switch-button.active rect {
		stroke: #333;
		stroke-width: 1;
	}
</style>
