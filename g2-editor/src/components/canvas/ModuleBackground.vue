<script setup lang="ts">
	const props = defineProps<{
		height: number;
	}>();
</script>

<template>
	<!-- Main background rect with currentColor for fill inheritance -->
	<rect width="256" :height="height" fill="currentColor" stroke="none" />

	<!-- Bottom gradient bar -->
	<rect width="256" height="4" :transform="`translate(0, ${height - 4})`" fill="url(#g119)" />

	<!-- Top gradient bar -->
	<rect width="256" height="4" fill="url(#g118)" />

	<!-- Right side gradient -->
	<path :d="`M256,0 l0,${height - 1} -4,-4 0,${-(height - 4)}z`" fill="url(#g117)" />

	<!-- Left side gradient -->
	<path :d="`M0,0 l0,${height - 1} 4,-4 0,${-(height - 4)}z`" fill="url(#g116)" />
</template>
