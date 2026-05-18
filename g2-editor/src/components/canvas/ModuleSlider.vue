<template>
	<g :transform="`translate(${param.x}, ${param.y})`" class="slider-control">
		<!-- Track (KnobSlider) - click and hold to repeat inc/dec -->
		<use href="#KnobSlider" width="10" height="62" @mousedown="onTrackMouseDown" @touchstart.passive="onTrackMouseDown" @dblclick="onDoubleClick" />

		<!-- Handle -->
		<rect
			width="10"
			height="6"
			fill="#666"
			:transform="`translate(0, ${levelShiftY})`"
			@mousedown="onDragMouseDown"
			@touchstart.passive="onDragMouseDown"
		/>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleParam } from '../../types';
	import { useSpinnerHoldInteraction } from '../../composables/useSpinnerHoldInteraction';
	import { useSliderDragInteraction } from '../../composables/useSliderDragInteraction';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const { onMouseDown: onTrackMouseDown, onDoubleClick } = useSpinnerHoldInteraction(
		'KnobSlider',
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
	);

	const { onMouseDown: onDragMouseDown } = useSliderDragInteraction(
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
	);

	const levelShiftY = computed(() => {
		return ((127 - props.value) / 132) * 42;
		// return ((127 - props.value) / 127) * 42;
	});
</script>
<style scoped>
	.slider-control {
		cursor: pointer;
		user-select: none;
	}

	.slider-control :deep(#levelshift) {
		cursor: ns-resize;
	}

	.slider-control :deep(#levelshift):hover rect:last-child {
		stroke: #666;
		stroke-width: 1;
	}
</style>
