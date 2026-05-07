<template>
	<svg :x="x" :y="y" :width="width" :height="height" class="overflow-hidden! cursor-pointer" @click="onCycleValue()">
		<rect x="0" y="0" :width="width" :height="height" fill="#CCC" stroke="#333" />
		<use v-if="bitmapId" :href="`#${bitmapId}`" :transform="`translate(0, ${offset})`" />
		<text
			v-else
			x="50%"
			y="50%"
			:width="width"
			:height="height"
			fill="#000"
			font-size="9"
			dominant-baseline="middle"
			text-anchor="middle"
			class="cursor-pointer!"
		>
			{{ valueName }}
		</text>
	</svg>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { getParam } from '../../renderer/parammap';
	import type { ParamDefinition } from '../../types';

	const props = defineProps<{
		x?: number;
		y?: number;
		paramIndex: number;
		paramType: string;
		value: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const paramMap = computed<ParamDefinition>(() => {
		return getParam(props.paramType) || {};
	});

	const x = computed(() => props.x ?? 0);
	const y = computed(() => props.y ?? 0);
	const width = computed(() => paramMap.value.width || 18);
	const height = computed(() => paramMap.value.height || 21);

	const bitmapId = computed(() => paramMap.value.img || '');
	const itemHeight = computed(() => paramMap.value.h || -18);

	const offset = computed(() => {
		return props.value * itemHeight.value;
	});

	const valueName = computed(() => {
		if (paramMap.value.defin) {
			const def = paramMap.value.defin[0].split(',');
			return def[props.value].substring(4);
		}
		return props.value;
	});

	function onCycleValue() {
		const low = paramMap.value.low || 0;
		const high = paramMap.value.high || 0;
		const range = high - low + 1;
		const current = Math.max(low, Math.min(props.value, high));
		const newValue = low + ((current - low + 1) % range);
		emit('change', props.paramIndex, newValue);
	}
</script>
