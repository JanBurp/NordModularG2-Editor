<template>
	<div class="relative" @mouseenter="hovered = true" @mouseleave="hovered = false">
		<!-- Drawn larger than the Knob's 26px box, but laid out at that size plus extraHeight (via margins),
		     so a meter doesn't change the cell height. Without extraHeight it overhangs downwards, into
		     the free space where a knob has its button (meters have none). -->
		<svg :width="SIZE" :height="SIZE" class="block" :style="{ margin: `${marginTop}px ${-OVERHANG / 2}px ${marginBottom}px` }">
			<circle :r="SIZE / 2" :cx="SIZE / 2" :cy="SIZE / 2" fill="#111" />
			<path v-for="z in VU_ZONES" :key="`dim-${z.from}`" :d="arc(z.from, z.to)" :stroke="z.dim" stroke-width="5" fill="none" />
			<template v-for="z in VU_ZONES" :key="`lit-${z.from}`">
				<path v-if="fraction > z.from" :d="arc(z.from, Math.min(fraction, z.to))" :stroke="z.lit" stroke-width="5" fill="none" />
			</template>
		</svg>
		<MeterNamePopup :text="label" :visible="hovered || f7Held" />
	</div>
</template>

<script setup lang="ts">
	// Parameter Page level meter (isLed assignment) in place of the toolbar Knob: the canvas
	// LevelMeter's zones bent along the knob's 270° sweep, like the G2's own LED ring.
	import { computed, ref } from 'vue';
	import { RADII } from '../../composables/useKnob';
	import { useKeyHoldOverlay } from '../../composables/useKeyHoldOverlay';
	import { describeArc } from '../../utils/knobArc';
	import { VU_ZONES, vuFraction } from '../../utils/vuLevel';
	import MeterNamePopup from './MeterNamePopup.vue';

	// extraHeight: px of layout space the cell freed up for the meter (centred in it, when it fits)
	const props = defineProps<{ value: number; label: string; extraHeight?: number }>();

	const KNOB_BOX = RADII.KnobMedium + 16; // layout size of the Knob it replaces
	const SIZE = 34;
	const OVERHANG = SIZE - KNOB_BOX;
	const spare = computed(() => (props.extraHeight ?? 0) - OVERHANG); // room left around the meter
	const marginTop = computed(() => Math.max(spare.value, 0) / 2);
	const marginBottom = computed(() => (spare.value >= 0 ? spare.value / 2 : spare.value));
	const hovered = ref(false);
	const { isVisible: f7Held } = useKeyHoldOverlay('F7');
	const fraction = computed(() => vuFraction(props.value));

	const arc = (from: number, to: number) => describeArc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, -135 + 270 * from, -135 + 270 * to);
</script>
