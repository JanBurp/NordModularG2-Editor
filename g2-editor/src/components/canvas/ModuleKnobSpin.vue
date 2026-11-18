<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-spin"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@wheel="onWheel"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event)"
	>
		<use href="#KnobSpin" width="10" height="10" />
		<rect v-if="morphColor" x="0" y="-2" width="10" height="2" :fill="morphColorHex(morphColor)" pointer-events="none" />
		<rect v-if="highlight" x="0" y="11" width="10" height="2" :fill="PANEL.highlight" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { PANEL } from '@/constants/colors';
	import type { ModuleParam } from '../../types';
	import { useSpinnerHoldInteraction } from '../../composables/useSpinnerHoldInteraction';
	import { useWheelInteraction } from '../../composables/useWheelInteraction';
	import { morphColorHex } from '../../utils/morphColors';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		highlight?: boolean;
		morphColor?: 'red' | 'blue' | null;
		min?: number; // default 0..127 (the Morph pane's range spinner uses -127..127)
		max?: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
		paramContextMenu: [paramIndex: number, event: MouseEvent];
	}>();

	const { onMouseDown } = useSpinnerHoldInteraction(
		'KnobSpin',
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
		props.min,
		props.max,
	);

	const { onWheel } = useWheelInteraction(
		() => props.value,
		(value) => emit('change', props.paramIndex, value),
		() => props.max ?? 127,
		props.min,
	);
</script>
<style scoped>
	.knob-spin {
		cursor: pointer;
		user-select: none;
	}
</style>
