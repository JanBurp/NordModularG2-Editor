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
		<rect v-if="highlight" x="0" y="11" width="10" height="2" fill="white" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
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
	);

	const { onWheel } = useWheelInteraction(
		() => props.value,
		(value) => emit('change', props.paramIndex, value),
	);
</script>
<style scoped>
	.knob-spin {
		cursor: pointer;
		user-select: none;
	}
</style>
