<script setup lang="ts">
	const props = defineProps<{
		ve: object;
	}>();
</script>

<template>
	<text v-if="ve.t" :x="ve.x" :y="ve.y" fill="#000" font-size="9">
		{{ ve.t }}
	</text>
</template>
