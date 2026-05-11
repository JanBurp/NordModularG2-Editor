<template>
	<line :x1="ve.x1" :y1="ve.y1" :x2="ve.x2" :y2="ve.y2" stroke="#333" />
</template>
<script setup lang="ts">
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
