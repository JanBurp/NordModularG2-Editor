<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-control"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@dblclick="onDoubleClick()"
	>
		<!-- Invisible hit area for easier grabbing -->
		<circle :r="radius + 4" :cx="radius + 2" :cy="radius + 2" fill="transparent" class="hit-area" />

		<!-- Main circle with radial gradient -->
		<circle :r="radius" :cx="radius + 2" :cy="radius + 2" fill="url(#g120)" stroke="#333" stroke-width="0.5" :class="{ dragging: isDragging }" />

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
		<path v-if="isReset" d="M-3,-2 L3,-2 L0,2 Z" fill="green" :transform="`translate(${radius + 2}, 0)`" />
	</g>
</template>
<script setup lang="ts">
	import { computed, toRef } from 'vue';
	import type { ModuleParam } from '../../types';
	import { useKnob } from '../../composables/useKnob';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const { radius, angle, isReset, isDragging, onMouseDown, onDoubleClick } = useKnob(
		toRef(props, 'value'),
		computed(() => props.param.n),
		(value) => emit('change', props.paramIndex, value),
	);
</script>
<style scoped>
	.knob-control {
		cursor: ns-resize;
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
