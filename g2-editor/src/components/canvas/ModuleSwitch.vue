<script setup lang="ts">
	import { computed } from 'vue';
	import { getParam } from '../../renderer/parammap';
	import type { ParamDefinition } from '../../types';

	const props = defineProps<{
		x: number;
		y: number;
		paramType: string;
		value: number;
		paramIndex: number;
		paramName: string;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const paramMap = computed<ParamDefinition>(() => {
		return getParam(props.paramType) || {};
	});

	const names = computed(() => paramMap.value.names || []);
	const defin = computed(() => paramMap.value.defin || []);
	const width = computed(() => paramMap.value.width || 18);
	const mode = computed(() => paramMap.value.mode);
	const rows = computed(() => paramMap.value.rows || 1);
	const bmp = computed(() => paramMap.value.bmp);
	const hasBitmap = computed(() => !!bmp.value);

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
		if (names.value.length === 1 && names.value[0] === 'Ch#') {
			return [props.paramName];
		}
		if (names.value.length > 1) {
			return names.value;
		}
		return optionNames.value;
	});

	const itemsPerRow = computed(() => {
		if (width.value === 18) return 1;
		return Math.ceil(names.value.length / rows.value);
	});

	const activeIndex = computed(() => {
		const low = paramMap.value.low || 0;
		const high = paramMap.value.high || names.value.length - 1 || 0;
		// Clamp value to valid range
		return Math.max(low, Math.min(props.value, high));
	});

	const singleButtonMode = computed(() => {
		return mode.value !== 'VR' && mode.value !== 'HR';
	});

	const activeOptionName = computed(() => {
		const idx = activeIndex.value;
		return optionNames.value[idx] ?? optionNames.value[0];
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
			const low = paramMap.value.low || 0;
			const high = paramMap.value.high || names.value.length - 1 || 0;

			// Ensure value is within bounds
			const newValue = Math.max(low, Math.min(index, high));

			if (newValue !== props.value) {
				emit('change', props.paramIndex, newValue);
			}
		}
	}

	function onCycleValue() {
		// Cycle to next value (for single-button switches)
		const low = paramMap.value.low || 0;
		const high = paramMap.value.high || names.value.length - 1 || 0;
		const range = high - low + 1;

		const current = Math.max(low, Math.min(props.value, high));
		const newValue = low + ((current - low + 1) % range);

		emit('change', props.paramIndex, newValue);
	}
</script>

<template>
	<g :transform="`translate(${x}, ${y})`" class="switch-control">
		<!-- Bitmap-based switch -->
		<template v-if="hasBitmap">
			<!-- Single button mode: show only active bitmap without highlight -->
			<svg v-if="singleButtonMode" :x="0" :y="0" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
				<rect x="0" y="0" :width="width" height="11" fill="#EEE" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :transform="`translate(0,${-(activeIndex * 10)})`" :clip-path="`url(#clip-${paramType}-0)`" />
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
				<use :href="`#Bitmap${bmp}`" :transform="`translate(${-(index * width)}, 0)`" :clip-path="`url(#clip-${paramType}-${index})`" />
			</svg>
		</template>

		<!-- Text-based switch -->
		<template v-else>
			<!-- Single button mode: show only active option without highlight -->
			<g v-if="singleButtonMode" class="switch-button" @click="onCycleValue">
				<rect :x="0" :y="0" :width="width" height="11" fill="#EEE" stroke="#333" />
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
