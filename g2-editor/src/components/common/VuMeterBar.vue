<template>
	<div class="relative h-[18px] rounded-xs border border-input-dimmed bg-[#111] cursor-grab" @mouseenter="hovered = true" @mouseleave="hovered = false">
		<div class="absolute inset-0.5 overflow-hidden">
			<div
				v-for="(seg, i) in segments"
				:key="i"
				class="absolute inset-y-0"
				:style="{ left: `${seg.from * 100}%`, width: `${(seg.to - seg.from) * 100}%`, background: seg.color }"
			/>
		</div>
		<MeterNamePopup :text="label" :visible="hovered || f7Held" />
	</div>
</template>

<script setup lang="ts">
	// Parameter Overview level meter (isLed assignment) in place of the text display: the canvas
	// LevelMeter's segments laid out left to right.
	import { computed, ref } from 'vue';
	import { useKeyHoldOverlay } from '../../composables/useKeyHoldOverlay';
	import { vuSegments } from '../../utils/vuLevel';
	import MeterNamePopup from './MeterNamePopup.vue';

	const props = defineProps<{ value: number; label: string }>();

	const hovered = ref(false);
	const { isVisible: f7Held } = useKeyHoldOverlay('F7');
	const segments = computed(() => vuSegments(props.value));
</script>
