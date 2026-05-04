<template>
	<g :transform="`translate(${x}, ${y})`" class="slider-control">
		<!-- Track (KnobSlider) -->
		<use href="#KnobSlider" width="10" height="62" @click="onClick" @dblclick="onDoubleClick" />

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
	import { useSpinnerClickInteraction } from '../../composables/useSpinnerClickInteraction';
	import { useSliderDragInteraction } from '../../composables/useSliderDragInteraction';

	const props = defineProps<{
		x: number;
		y: number;
		value: number;
		paramIndex: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const { onClick, onDoubleClick } = useSpinnerClickInteraction(
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
		return ((127 - props.value) / 135) * 42;
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
