<template>
	<path v-if="ve.d" :d="ve.d" stroke="#333" fill="none" />
</template>
<script setup lang="ts">
	defineProps<{
		ve: object;
	}>();
</script>
