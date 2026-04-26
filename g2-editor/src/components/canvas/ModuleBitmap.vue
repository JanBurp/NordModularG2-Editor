<script setup lang="ts">
	const props = defineProps<{
		ve: object;
	}>();
</script>

<template>
	<use v-if="ve.id" :href="`#Bitmap${ve.id}`" :x="ve.x" :y="ve.y" />
</template>
