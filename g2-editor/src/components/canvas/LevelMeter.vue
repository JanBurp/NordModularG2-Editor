<template>
	<g>
		<rect :x="ve.x" :y="ve.y" :width="ve.w" :height="ve.h" fill="#111" />
		<rect v-for="z in zones" :key="`dim-${z.from}`" :x="ve.x" :y="z.dimY" :width="ve.w" :height="z.dimH" :fill="z.dim" />
		<template v-for="z in zones" :key="`lit-${z.from}`">
			<rect v-if="z.litH > 0" :x="ve.x" :y="z.litY" :width="ve.w" :height="z.litH" :fill="z.lit" />
		</template>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';
	import { VU_ZONES, vuFraction } from '../../utils/vuLevel';

	const props = defineProps<{
		ve: VisualElement;
		value: number;
	}>();

	const zones = computed(() => {
		const y = props.ve.y as number;
		const h = props.ve.h as number;
		const level = Math.round(h * vuFraction(props.value));
		return VU_ZONES.map((z) => {
			const start = Math.round(h * z.from);
			const litH = Math.max(0, Math.min(level, Math.round(h * z.to)) - start);
			return { ...z, dimY: y + h * (1 - z.to), dimH: h * (z.to - z.from), litY: y + h - start - litH, litH };
		});
	});
</script>
