<template>
	<use v-if="ve.id" :href="`#Bitmap${ve.id}`" :x="ve.x" :y="ve.y" />
</template>
<script setup lang="ts">
	defineProps<{
		ve: object;
	}>();
</script>
