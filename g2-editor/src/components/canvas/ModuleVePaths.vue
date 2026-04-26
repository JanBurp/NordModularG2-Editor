<script setup lang="ts">
	const props = defineProps<{
		ve: object;
	}>();
</script>

<template>
	<path v-if="ve.d" :d="ve.d" stroke="#333" fill="none" />
</template>
