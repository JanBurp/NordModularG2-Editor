<template>
	<!-- KnobReset centre marker: bright green at centre, dark green when off-centre; click resets -->
	<path
		d="M-4,-4 L4,-4 L0,2.5 Z"
		:fill="value === KNOB_RESET_CENTRE ? CENTRE_FILL : OFF_CENTRE_FILL"
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

	const CENTRE_FILL = '#AFA';
	const OFF_CENTRE_FILL = '#066';

	defineProps<{ radius: number; value: number }>();
	const emit = defineEmits<{ reset: [] }>();
</script>
