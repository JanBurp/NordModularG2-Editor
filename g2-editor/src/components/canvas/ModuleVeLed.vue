<template>
	<rect
		v-for="i in (ve.cnt || 1)"
		:key="`led-${i}`"
		:x="(ve.x || 0) + 1 + (Number(i) - 1) * (Number(ve.xo) || 0)"
		:y="ve.y"
		:width="ve.w"
		height="6.5"
		:fill="ledOn ? '#0F0' : '#040'"
		stroke="#000"
	/>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';
	import { useLedStore } from '../../store/led';
	const props = defineProps<{
		ve: VisualElement;
		area: 'fx' | 'va';
		moduleIndex: number;
		groupId: number;
	}>();
	const ledStore = useLedStore();
	const ledOn = computed(() => ledStore.getLedState(props.area, props.moduleIndex, props.groupId));
</script>
