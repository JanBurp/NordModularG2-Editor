<template>
	<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<path v-for="d in icons[name]" :key="d" :d="d" />
	</svg>
</template>

<script setup lang="ts">
	const icons = {
		undo: ['M5 1.5 L2 4.5 L5 7.5', 'M2 4.5 H10 Q14 4.5 14 8.5 Q14 13 10 13 H8'],
		redo: ['M11 1.5 L14 4.5 L11 7.5', 'M14 4.5 H6 Q2 4.5 2 8.5 Q2 13 6 13 H8'],
		chevronRight: ['M6 3l5 5-5 5'],
		chevronDown: ['M3 6l5 5 5-5'],
		arrowUp: ['M8 13V3', 'M4 7l4-4 4 4'],
		folder: ['M1.5 4.5h4.5l1 1.5H14a.5.5 0 0 1 .5.5V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a.5.5 0 0 1 .5-.5Z'],
		close: ['M4 4l8 8', 'M12 4l-8 8'],
		link: ['M6.5 9.5l3-3', 'M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2', 'M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8'],
		trash: ['M2.5 4h11', 'M6 4V2.5h4V4', 'M4 4l.7 9.5h6.6L12 4', 'M6.5 6.5v4.5', 'M9.5 6.5v4.5'],
	} as const;

	defineProps<{ name: keyof typeof icons }>();
</script>
