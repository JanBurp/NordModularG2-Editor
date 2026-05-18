<template>
	<g>
		<rect :x="ve.x" :y="ve.y" :width="ve.w" :height="ve.h" fill="#111" />
		<rect :x="ve.x" :y="(ve.y as number) + 2 * partH" :width="ve.w" :height="2 * partH" fill="#005500" />
		<rect :x="ve.x" :y="(ve.y as number) + partH" :width="ve.w" :height="partH" fill="#555500" />
		<rect :x="ve.x" :y="ve.y as number" :width="ve.w" :height="partH" fill="#550000" />

		<rect v-if="greenH > 0" :x="ve.x" :y="(ve.y as number) + (ve.h as number) - greenH" :width="ve.w" :height="greenH" fill="#00cc00" />
		<rect v-if="yellowH > 0" :x="ve.x" :y="(ve.y as number) + (ve.h as number) - greenH - yellowH" :width="ve.w" :height="yellowH" fill="#cccc00" />
		<rect v-if="redH > 0" :x="ve.x" :y="(ve.y as number) + (ve.h as number) - level" :width="ve.w" :height="redH" fill="#cc0000" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';

	const props = defineProps<{
		ve: VisualElement;
		value: number;
	}>();

	const h = computed(() => props.ve.h as number);
	const partH = computed(() => h.value / 4);

	const level = computed(() => {
		if (!props.value || props.value === 255) return 0;
		return Math.min(Math.round(h.value * Math.log10(props.value) * 0.45), h.value);
	});

	const greenThreshold = computed(() => Math.round((h.value * 8) / 16));
	const yellowThreshold = computed(() => Math.round((h.value * 12) / 16));

	const greenH = computed(() => Math.min(level.value, greenThreshold.value));
	const yellowH = computed(() => Math.max(0, Math.min(level.value, yellowThreshold.value) - greenThreshold.value));
	const redH = computed(() => Math.max(0, level.value - yellowThreshold.value));
</script>
