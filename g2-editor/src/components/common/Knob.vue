<template>
	<div class="knob-wrapper" :style="{ cursor }">
		<svg :width="radius + 16" :height="radius + 16" class="knob-svg" @mousedown="onMouseDown" @touchstart.passive="onMouseDown" @wheel="onWheel">
			<defs>
				<!-- Local copy of the g120 radial gradient (avoids dependency on canvas SVG defs) -->
				<radialGradient id="knob-gradient" gradientUnits="objectBoundingBox" cx="50%" cy="50%" r="70%">
					<stop stop-color="#FFF" offset="0" />
					<stop stop-color="#FFF" offset="0.5" />
					<stop stop-color="#000" offset="1" />
				</radialGradient>
			</defs>
			<!-- Offset group: matches ModuleKnob coordinate space, shifted by (1,4) for padding -->
			<g>
				<circle :r="radius + 4" :cx="radius + 2" :cy="radius + 2" fill="transparent" />
				<circle
					ref="knobCircle"
					:r="radius"
					:cx="radius + 2"
					:cy="radius + 2"
					fill="url(#knob-gradient)"
					stroke="#333"
					stroke-width="0.5"
					:class="{ dragging: isDragging }"
				/>
				<!-- Mirrors ModuleKnob.vue's canvas equivalent; shared markup lives in MorphKnobOverlay.vue -->
				<MorphKnobOverlay :radius="radius" :value="value" :color="colorVariant" :morph-range="morphRange" />
				<line x1="0.5" :y1="radius + 9.5" x2="2.5" :y2="radius + 7.5" stroke="#333" />
				<line :x1="radius * 2 + 3.5" :y1="radius + 9.5" :x2="radius * 2 + 1.5" :y2="radius + 7.5" stroke="#333" />
				<line
					:x1="radius + 2"
					:y1="radius + 2"
					:x2="radius + 2"
					:y2="2"
					stroke="black"
					stroke-width="2"
					:transform="`rotate(${angle} ${radius + 2} ${radius + 2})`"
				/>
				<path
					v-if="isReset"
					d="M-3,-3 L3,-3 L0,2 Z"
					fill="green"
					:transform="`translate(${radius + 2}, 0)`"
					style="cursor: pointer"
					@mousedown.stop
					@click.stop="resetToDefault()"
				/>
			</g>
		</svg>
	</div>
</template>
<script setup lang="ts">
	import { computed, ref } from 'vue';
	import { useKnob } from '../../composables/useKnob';
	import MorphKnobOverlay from './MorphKnobOverlay.vue';

	const props = defineProps<{
		value: number;
		type?: string; // 'KnobBig' | 'KnobMedium' | 'KnobSmall' | 'KnobReset'
		colorVariant?: 'red' | 'blue' | null; // Morph Groups: red = selected group, blue = a different group
		morphRange?: number; // selected group's morph range, when colorVariant === 'red' (see ModuleKnob.vue)
	}>();

	const emit = defineEmits<{
		change: [value: number];
	}>();

	const knobCircle = ref<Element | null>(null);
	const { radius, angle, isReset, isDragging, cursor, onMouseDown, onWheel, resetToDefault } = useKnob(
		computed(() => props.value),
		computed(() => props.type ?? 'KnobMedium'),
		(value) => emit('change', value),
		knobCircle,
	);
</script>
<style scoped>
	.knob-wrapper {
		display: block;
		user-select: none;
	}

	.knob-svg circle.dragging {
		stroke: #888;
		stroke-width: 1.5;
	}
</style>
