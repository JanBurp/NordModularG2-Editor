<template>
	<!-- Assigned to a morph group: whole knob tinted red (selected group) or blue (another group) -->
	<circle
		v-if="color"
		:r="radius"
		:cx="radius + 2"
		:cy="radius + 2"
		:fill="morphColorHex(color)"
		opacity="0.55"
		style="mix-blend-mode: multiply"
		pointer-events="none"
	/>

	<!-- Assigned to the selected group: a darker "piece of the cake" sector shows the morph range -->
	<path
		v-if="color === 'red' && morphRange !== undefined"
		:d="describeMorphSector(radius + 2, radius + 2, radius, value, clampedRangeTarget)"
		fill="#Ba4058"
		opacity="0.7"
		style="mix-blend-mode: multiply"
		pointer-events="none"
	/>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { describeMorphSector } from '../../utils/knobArc';
	import { clamp } from '../../utils/math';
	import { morphColorHex } from '../../utils/morphColors';

	const props = defineProps<{
		radius: number;
		value: number;
		color?: 'red' | 'blue' | null;
		morphRange?: number;
	}>();

	const clampedRangeTarget = computed(() => clamp(props.value + (props.morphRange ?? 0), 0, 127));
</script>
