<template>
	<!-- KnobReset centre marker: bright green at centre, dark green when off-centre; click resets -->
	<path
		d="M-4,-4 L4,-4 L0,2.5 Z"
		:fill="value === KNOB_RESET_CENTRE ? KNOB_RESET.centre : KNOB_RESET.offCentre"
		:stroke="PANEL.line"
		stroke-width="0.5"
		:transform="`translate(${radius + 2}, 0)`"
		style="cursor: pointer"
		@mousedown.stop
		@click.stop="emit('reset')"
	/>
</template>
<script setup lang="ts">
	import { KNOB_RESET, PANEL } from '@/constants/colors';
	import { KNOB_RESET_CENTRE } from '../../composables/useKnob';

	defineProps<{ radius: number; value: number }>();
	const emit = defineEmits<{ reset: [] }>();
</script>
