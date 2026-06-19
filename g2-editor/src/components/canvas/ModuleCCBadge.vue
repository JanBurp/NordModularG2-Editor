<template>
	<g pointer-events="none">
		<rect :x="x" :y="y" :width="badgeWidth" height="15" fill="#FF0" stroke="#000" stroke-width="0.8" rx="2" />
		<text :x="x + badgeWidth / 2" :y="y + 11" fill="#000" font-size="11" font-weight="bold" font-family="monospace" text-anchor="middle">CC# {{ cc }}</text>
	</g>
</template>

<script setup lang="ts">
	import { computed } from 'vue';

	const props = defineProps<{
		cc: number;
		x: number;
		y: number;
	}>();

	// Width scales with the number of digits
	const badgeWidth = computed(() => (props.cc >= 100 ? 52 : props.cc >= 10 ? 46 : 40));
</script>
