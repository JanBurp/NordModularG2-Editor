<template>
	<g>
		<rect :x="ve.x" :y="ve.y" :width="ve.w" :height="ve.h" fill="#111" />
		<rect v-for="(s, i) in segments" :key="i" :x="ve.x" :y="s.y" :width="ve.w" :height="s.h" :fill="s.color" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';
	import { vuSegments } from '../../utils/vuLevel';

	const props = defineProps<{
		ve: VisualElement;
		value: number;
	}>();

	// Bottom to top
	const segments = computed(() => {
		const y = props.ve.y as number;
		const h = props.ve.h as number;
		return vuSegments(props.value).map((s) => ({ color: s.color, y: y + h * (1 - s.to), h: h * (s.to - s.from) }));
	});
</script>
