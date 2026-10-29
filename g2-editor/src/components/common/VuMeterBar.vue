<template>
	<div class="relative h-[18px] rounded-xs border border-input-dimmed bg-[#111] cursor-grab" @mouseenter="hovered = true" @mouseleave="hovered = false">
		<div class="absolute inset-0.5 overflow-hidden">
			<div
				v-for="z in VU_ZONES"
				:key="z.from"
				class="absolute inset-y-0"
				:style="{ left: `${z.from * 100}%`, width: `${(z.to - z.from) * 100}%`, background: z.dim }"
			/>
			<template v-for="z in VU_ZONES" :key="`lit-${z.from}`">
				<div
					v-if="fraction > z.from"
					class="absolute inset-y-0"
					:style="{ left: `${z.from * 100}%`, width: `${(Math.min(fraction, z.to) - z.from) * 100}%`, background: z.lit }"
				/>
			</template>
		</div>
		<MeterNamePopup :text="label" :visible="hovered || f7Held" />
	</div>
</template>

<script setup lang="ts">
	// Parameter Overview level meter (isLed assignment) in place of the text display: the canvas
	// LevelMeter's zones laid out left to right.
	import { computed, ref } from 'vue';
	import { useKeyHoldOverlay } from '../../composables/useKeyHoldOverlay';
	import { VU_ZONES, vuFraction } from '../../utils/vuLevel';
	import MeterNamePopup from './MeterNamePopup.vue';

	const props = defineProps<{ value: number; label: string }>();

	const hovered = ref(false);
	const { isVisible: f7Held } = useKeyHoldOverlay('F7');
	const fraction = computed(() => vuFraction(props.value));
</script>
