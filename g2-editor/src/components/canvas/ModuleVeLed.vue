<template>
	<rect
		v-for="i in ve.cnt || 1"
		:key="`led-${i}`"
		:x="(ve.x || 0) + 1 + (i - 1) * (ve.xo || 0)"
		:y="ve.y"
		:width="ve.w"
		height="6.5"
		:fill="props.on ? '#0F0' : '#040'"
		stroke="#000"
	/>
</template>
<script setup lang="ts">
	import type { VisualElement } from '../../types';
	const props = defineProps<{
		ve: VisualElement;
		on?: boolean;
	}>();
</script>
