<template>
	<template v-if="ve.type === 'ledArray'">
		<rect
			v-for="i in ve.cnt || 1"
			:key="`led-${i}`"
			:x="(ve.x || 0) + 1 + (Number(i) - 1) * (Number(ve.xo) || 0)"
			:y="ve.y"
			:width="ve.w"
			height="6.5"
			:fill="activeStep === i - 1 ? '#0F0' : '#040'"
			stroke="#000"
		/>
	</template>
	<rect v-else :x="(ve.x || 0) + 1" :y="ve.y" :width="ve.w" height="6.5" :fill="ledOn ? '#0F0' : '#040'" stroke="#000" />
</template>
<script setup lang="ts">
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
		ledOn: boolean;
		activeStep: number;
	}>();
</script>
