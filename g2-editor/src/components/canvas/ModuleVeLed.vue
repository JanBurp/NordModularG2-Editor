<script setup lang="ts">
	const props = defineProps<{
		ve: object;
	}>();
</script>

<template>
	<rect v-for="i in ve.cnt || 1" :key="`led-${i}`" :x="(ve.x || 0) + 1 + (i - 1) * (ve.xo || 0)" :y="ve.y" :width="ve.w" height="6.5" fill="#040" stroke="#000" />
</template>
