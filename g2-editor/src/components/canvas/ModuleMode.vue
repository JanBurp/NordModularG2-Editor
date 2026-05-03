<script setup lang="ts">
	import { computed } from 'vue';
	import { getParam } from '../../renderer/parammap';
	import type { ParamDefinition } from '../../types';

	const props = defineProps<{
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		paramType: string;
		value: number;
	}>();

	const x = computed(() => props.x ?? 0);
	const y = computed(() => props.y ?? 0);
	const width = computed(() => props.width ?? 20);
	const height = computed(() => props.height ?? 18);

	const paramMap = computed<ParamDefinition>(() => {
		return getParam(props.paramType) || {};
	});

	const bitmapId = computed(() => paramMap.value.img || '');
	const itemHeight = computed(() => paramMap.value.h || -18);

	const offset = computed(() => {
		return props.value * itemHeight.value;
	});
</script>

<template>
	<svg :x="x" :y="y" :width="Math.abs(width)" :height="height" class="mode-selector clipper">
		<use v-if="bitmapId" :href="`#${bitmapId}`" :transform="`translate(0, ${offset})`" />
	</svg>
</template>
