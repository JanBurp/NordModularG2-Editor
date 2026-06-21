<template>
	<g v-if="ve.t">
		<rect :x="ve.x" :y="ve.y" :width="ve.w" height="11" fill="#999" />
		<line :x1="(ve.x ?? 0) + (ve.w ?? 0)" :y1="(ve.y ?? 0) + 1" :x2="ve.x2" :y2="(ve.y ?? 0) + 1" stroke="#999" style="stroke-width: 2" />
		<text :x="(ve.x ?? 0) + 3" :y="(ve.y ?? 0) + 8.5" fill="#333" font-size="9">{{ ve.t }}</text>
	</g>
</template>
<script setup lang="ts">
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
