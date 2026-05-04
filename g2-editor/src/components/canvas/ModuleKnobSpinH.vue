<template>
	<g :transform="`translate(${x}, ${y})`" class="knob-spin-h" @click="onClick" @dblclick="onDoubleClick">
		<use href="#KnobSpinH" width="20" height="10" />
	</g>
</template>
<script setup lang="ts">
	import { useSpinnerClickInteraction } from '../../composables/useSpinnerClickInteraction';

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
