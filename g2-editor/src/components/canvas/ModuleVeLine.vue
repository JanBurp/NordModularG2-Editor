<script setup lang="ts">
	const props = defineProps<{
		ve: object;
	}>();
</script>

<template>
	<line :x1="ve.x1" :y1="ve.y1" :x2="ve.x2" :y2="ve.y2" stroke="#333" />
</template>
