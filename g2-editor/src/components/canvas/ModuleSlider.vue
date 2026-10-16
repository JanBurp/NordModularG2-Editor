<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="slider-control"
		@wheel="onWheel"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event)"
	>
		<!-- Track (KnobSlider) - click and hold to repeat inc/dec -->
		<use href="#KnobSlider" width="10" height="62" @mousedown="onTrackMouseDown" @touchstart.passive="onTrackMouseDown" />

		<!-- Morph range span, only for the currently selected group's assignment -->
		<rect
			v-if="morphRange !== undefined"
			width="10"
			:y="Math.min(levelShiftY, rangeTargetShiftY)"
			:height="Math.abs(rangeTargetShiftY - levelShiftY) + 6"
			:fill="morphColorHex(morphColor)"
			opacity="0.5"
			pointer-events="none"
		/>

		<!-- Handle -->
		<rect
			width="10"
			height="6"
			:fill="morphColorHex(morphColor, '#666')"
			:transform="`translate(0, ${levelShiftY})`"
			@mousedown="onDragMouseDown"
			@touchstart.passive="onDragMouseDown"
		/>

		<!-- Selected param underline -->
		<rect v-if="highlight" x="0" y="63" width="10" height="2" fill="white" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleParam } from '../../types';
	import { useSpinnerHoldInteraction } from '../../composables/useSpinnerHoldInteraction';
	import { useSliderDragInteraction } from '../../composables/useSliderDragInteraction';
	import { useWheelInteraction } from '../../composables/useWheelInteraction';
	import { getParamDefault } from '../../renderer/nmg2mods';
	import { clamp } from '../../utils/math';
	import { morphColorHex } from '../../utils/morphColors';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		highlight?: boolean;
		morphColor?: 'red' | 'blue' | null;
		morphRange?: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
		paramContextMenu: [paramIndex: number, event: MouseEvent];
	}>();

	const { onMouseDown: onTrackMouseDown } = useSpinnerHoldInteraction(
		'KnobSlider',
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
		() => getParamDefault(props.param),
	);

	const { onMouseDown: onDragMouseDown } = useSliderDragInteraction(
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
		() => getParamDefault(props.param),
	);

	const { onWheel } = useWheelInteraction(
		() => props.value,
		(value) => emit('change', props.paramIndex, value),
	);

	const levelShiftY = computed(() => {
		return ((127 - props.value) / 127) * 42;
	});

	const rangeTargetShiftY = computed(() => {
		const target = clamp(props.value + (props.morphRange ?? 0), 0, 127);
		return ((127 - target) / 127) * 42;
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
