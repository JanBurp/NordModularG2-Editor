<template>
	<text v-if="ve.t" :x="ve.x" :y="ve.y" :text-anchor="ve.anchor" fill="#000" font-size="9">
		{{ ve.t }}
	</text>
</template>
<script setup lang="ts">
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
