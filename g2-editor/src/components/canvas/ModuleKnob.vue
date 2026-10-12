<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-control"
		:style="{ cursor }"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@wheel="onWheel"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event)"
	>
		<!-- Invisible hit area for easier grabbing -->
		<circle :r="radius + 4" :cx="radius + 2" :cy="radius + 2" fill="transparent" class="hit-area" />

		<!-- Main circle with radial gradient -->
		<circle
			ref="knobCircle"
			:r="radius"
			:cx="radius + 2"
			:cy="radius + 2"
			fill="url(#g120)"
			stroke="#333"
			stroke-width="0.5"
			:class="{ dragging: isDragging }"
		/>

		<MorphKnobOverlay :radius="radius" :value="value" :color="morphColor" :morph-range="morphRange" />

		<!-- Bottom-left tick mark -->
		<line x1="0.5" :y1="radius + 9.5" x2="2.5" :y2="radius + 7.5" stroke="#333" />

		<!-- Bottom-right tick mark -->
		<line :x1="radius * 2 + 3.5" :y1="radius + 9.5" :x2="radius * 2 + 1.5" :y2="radius + 7.5" stroke="#333" />

		<!-- Rotating indicator line -->
		<line
			:x1="radius + 2"
			:y1="radius + 2"
			:x2="radius + 2"
			:y2="2"
			stroke="black"
			stroke-width="2"
			:transform="`rotate(${angle} ${radius + 2} ${radius + 2})`"
		/>

		<!-- Reset indicator triangle (only for KnobReset) -->
		<KnobResetMarker v-if="isReset" :radius="radius" :value="value" @reset="resetToDefault()" />
	</g>
</template>
<script setup lang="ts">
	import { computed, ref, toRef } from 'vue';
	import type { ModuleParam } from '../../types';
	import { useKnob } from '../../composables/useKnob';
	import MorphKnobOverlay from '../common/MorphKnobOverlay.vue';
	import KnobResetMarker from '../common/KnobResetMarker.vue';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		morphColor?: 'red' | 'blue' | null;
		morphRange?: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
		paramContextMenu: [paramIndex: number, event: MouseEvent];
	}>();

	const knobCircle = ref<Element | null>(null);
	const { radius, angle, isReset, isDragging, cursor, onMouseDown, onWheel, resetToDefault } = useKnob(
		toRef(props, 'value'),
		computed(() => props.param.n),
		(value) => emit('change', props.paramIndex, value),
		knobCircle,
	);
</script>
<style scoped>
	.knob-control {
		user-select: none;
	}

	.knob-control:hover .hit-area + circle {
		stroke: #666;
		stroke-width: 1;
	}

	.knob-control circle.dragging {
		stroke: #888;
		stroke-width: 1.5;
	}
</style>
