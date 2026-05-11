<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="knob-control"
		@mousedown="onMouseDown"
		@touchstart.passive="onMouseDown"
		@dblclick="onDoubleClick"
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
	import { computed, ref } from 'vue';
	import type { ModuleParam } from '../../types';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const radius = computed(() => {
		const radii: Record<string, number> = {
			KnobBig: 11,
			KnobMedium: 10,
			KnobSmall: 9,
			KnobReset: 10,
		};
		return radii[props.param.n] || 10;
	});

	const angle = computed(() => {
		// Map 0-127 to -135° to +135° (270° range)
		return (props.value / 128) * 270 - 135;
	});

	const isReset = computed(() => props.param.n === 'KnobReset');

	// Interaction state
	const isDragging = ref(false);
	const startY = ref(0);
	const startValue = ref(0);

	function onMouseDown(event: MouseEvent | TouchEvent) {
		isDragging.value = true;
		startY.value = 'touches' in event ? event.touches[0].clientY : event.clientY;
		startValue.value = props.value;

		// Add global listeners
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		document.addEventListener('touchmove', onMouseMove, { passive: false });
		document.addEventListener('touchend', onMouseUp);
	}

	function onMouseMove(event: MouseEvent | TouchEvent) {
		if (!isDragging.value) return;
		event.preventDefault();

		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		const deltaY = startY.value - clientY; // Up is positive

		// Sensitivity: 1 unit per pixel, clamp to 0-127
		const newValue = Math.max(0, Math.min(127, Math.round(startValue.value + deltaY)));

		if (newValue !== props.value) {
			emit('change', props.paramIndex, newValue);
		}
	}

	function onMouseUp() {
		isDragging.value = false;
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('touchmove', onMouseMove);
		document.removeEventListener('touchend', onMouseUp);
	}

	function onDoubleClick() {
		// Reset to default (64)
		emit('change', props.paramIndex, 64);
	}
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
