<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-spin"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event)"
		@mouseover.stop="emit('paramHover', props.paramIndex)"
	>
		<use href="#KnobSpin" width="10" height="10" />
		<rect v-if="highlight" x="0" y="11" width="10" height="2" fill="white" pointer-events="none" />
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
		paramContextMenu: [paramIndex: number, event: MouseEvent];
		paramHover: [paramIndex: number];
	}>();

	const { onMouseDown } = useSpinnerHoldInteraction(
		'KnobSpin',
		props.paramIndex,
		() => props.value,
		(index, value) => emit('change', index, value),
	);
</script>
<style scoped>
	.knob-spin {
		cursor: pointer;
		user-select: none;
	}

</style>
