<script setup lang="ts">
	import { computed, ref } from 'vue';

	const props = defineProps<{
		x: number;
		y: number;
		value: number;
		paramIndex: number;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	// Map 0-127 to 0-39.875px
	const handleY = computed(() => {
		return props.value * 0.3125;
	});

	// Interaction state
	const isDragging = ref(false);
	const startY = ref(0);
	const startValue = ref(0);

	function onMouseDown(event: MouseEvent | TouchEvent) {
		isDragging.value = true;
		startY.value = 'touches' in event ? event.touches[0].clientY : event.clientY;
		startValue.value = props.value;

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

		// Sensitivity: ~3 units per pixel for finer control, clamp to 0-127
		const sensitivity = 0.3;
		const newValue = Math.max(0, Math.min(127, Math.round(startValue.value + deltaY * sensitivity)));

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
		emit('change', props.paramIndex, 64);
	}
</script>

<template>
	<g :transform="`translate(${x}, ${y})`" class="slider-control" @mousedown="onMouseDown" @touchstart.passive="onMouseDown" @dblclick="onDoubleClick">
		<!-- Track (hit area) -->
		<rect width="12" height="62" fill="rgba(44,0,0,0.01)" class="track" />

		<!-- Handle -->
		<rect
			width="10"
			height="6"
			x="1"
			fill="url(#g121)"
			stroke="#333"
			stroke-width="0.5"
			:transform="`translate(0, ${handleY})`"
			:class="{ dragging: isDragging }"
		/>
	</g>
</template>

<style scoped>
	.slider-control {
		cursor: ns-resize;
		user-select: none;
	}

	.slider-control:hover rect:last-child {
		stroke: #666;
		stroke-width: 1;
	}

	.slider-control rect.dragging {
		stroke: #888 !important;
		stroke-width: 1.5 !important;
	}
</style>
