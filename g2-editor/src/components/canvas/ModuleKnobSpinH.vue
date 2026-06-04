<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-spin-h"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@mouseover.stop="emit('paramHover', props.paramIndex)"
	>
		<use href="#KnobSpinH" width="20" height="10" />
		<rect v-if="highlight" x="0" y="11" width="20" height="2" fill="white" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import type { ModuleParam } from '../../types';
	import { useSpinnerHoldInteraction } from '../../composables/useSpinnerHoldInteraction';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		highlight?: boolean;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
		paramHover: [paramIndex: number];
	}>();

	const { onMouseDown } = useSpinnerHoldInteraction(
		'KnobSpinH',
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
	);
</script>
<style scoped>
	.knob-spin-h {
		cursor: pointer;
		user-select: none;
	}

</style>
