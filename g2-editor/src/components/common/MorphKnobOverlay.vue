<template>
	<!-- Assigned to a morph group: whole knob tinted red (selected group) or blue (another group) -->
	<circle
		v-if="color"
		data-testid="morph-tint"
		:data-morph-color="color"
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
		:d="describeMorphSector(radius + 2, radius + 2, radius, sector[0], sector[1], maxValue)"
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
		max?: number; // param's own range (parammap `high`), default 0..127
	}>();

	const maxValue = computed(() => props.max ?? 127);
	// A morphed param with a range other than 0..127 shows the sector over the whole arc, exactly
	// like the original editor (CPnlKnobSliderABC::UpdateGraphics draws it as 0..127 in that case).
	const sector = computed<[number, number]>(() =>
		maxValue.value === 127 ? [props.value, clamp(props.value + (props.morphRange ?? 0), 0, 127)] : [0, maxValue.value],
	);
</script>
