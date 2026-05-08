<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-spin-h"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@dblclick="onDoubleClick"
	>
		<use href="#KnobSpinH" width="20" height="10" />
	</g>
</template>
<script setup lang="ts">
	import type { ModuleParam } from '../../types';
	import { useSpinnerHoldInteraction } from '../../composables/useSpinnerHoldInteraction';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const { onMouseDown, onDoubleClick } = useSpinnerHoldInteraction(
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
