<template>
	<!-- KnobReset centre marker: bright (graph) green at centre, darker green when off-centre; click resets -->
	<path
		d="M-4,-4 L4,-4 L0,2.5 Z"
		:fill="value === KNOB_RESET_CENTRE ? GRAPH_COLORS.dimLine : GRAPH_COLORS.areaFill"
		stroke="#333"
		stroke-width="0.5"
		:transform="`translate(${radius + 2}, 0)`"
		style="cursor: pointer"
		@mousedown.stop
		@click.stop="emit('reset')"
	/>
</template>
<script setup lang="ts">
	import { KNOB_RESET_CENTRE } from '../../composables/useKnob';
	import { GRAPH_COLORS } from '../canvas/graphFunctions';

	defineProps<{ radius: number; value: number }>();
	const emit = defineEmits<{ reset: [] }>();
</script>
