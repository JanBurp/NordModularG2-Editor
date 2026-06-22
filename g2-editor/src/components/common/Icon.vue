<template>
	<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<path v-for="d in icons[name]" :key="d" :d="d" />
	</svg>
</template>

<script setup lang="ts">
	const icons = {
		undo: ['M5 1.5 L2 4.5 L5 7.5', 'M2 4.5 H10 Q14 4.5 14 8.5 Q14 13 10 13 H8'],
		redo: ['M11 1.5 L14 4.5 L11 7.5', 'M14 4.5 H6 Q2 4.5 2 8.5 Q2 13 6 13 H8'],
	} as const;

	defineProps<{ name: keyof typeof icons }>();
</script>
