<template>
	<div ref="wrapperEl" class="knob-wrapper" :style="{ cursor, position: 'relative', zIndex: selected ? 10 : undefined }">
		<svg
			:width="radius + 16"
			:height="radius + 16"
			class="knob-svg"
			style="overflow: visible"
			@mousedown="onKnobMouseDown"
			@touchstart.passive="onMouseDown"
			@wheel="onWheel"
		>
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
				<MorphKnobOverlay :radius="radius" :value="value" :color="colorVariant" :morph-range="morphRange" :max="max" />
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
				<KnobResetMarker v-if="isReset" :radius="radius" :value="value" @reset="resetToDefault()" />
				<!-- Increment/decrement spinner (only while the knob is selected) -->
				<!-- pointer-events="all" keeps it clickable when ParameterPagesGroup sets pointer-events-none on the Knob during
				     Alt (Alt+drag assign); .prevent stops that draggable wrapper from starting a drag from the spinner. -->
				<g
					v-if="selected"
					class="knob-spin-v"
					pointer-events="all"
					:transform="`translate(${radius - 8}, ${radius * 2 + SPIN_OFFSET_Y})`"
					@mousedown.stop.prevent="onSpinMouseDown"
				>
					<use href="#KnobSpinV" width="20" height="10" />
				</g>
			</g>
		</svg>
	</div>
</template>
<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref } from 'vue';
	import { clamp } from '@/utils/math';
	import { useKnob } from '../../composables/useKnob';
	import { useSpinnerHoldInteraction } from '../../composables/useSpinnerHoldInteraction';
	import MorphKnobOverlay from './MorphKnobOverlay.vue';
	import KnobResetMarker from './KnobResetMarker.vue';

	const props = defineProps<{
		value: number;
		type?: string; // 'KnobBig' | 'KnobMedium' | 'KnobSmall' | 'KnobReset'
		colorVariant?: 'red' | 'blue' | null; // Morph Groups: red = selected group, blue = a different group
		morphRange?: number; // selected group's morph range, when colorVariant === 'red' (see ModuleKnob.vue)
		max?: number; // assigned param's own range (parammap `high`), default 0..127
	}>();

	const emit = defineEmits<{
		change: [value: number];
	}>();

	// Distance below the knob's bottom edge to the spinner's top edge; lower = closer to the knob.
	const SPIN_OFFSET_Y = 0;
	const ALT_STEP = 16; // same big step as ALT+ArrowUp/Down in useModuleKeyboard

	const knobCircle = ref<Element | null>(null);
	const wrapperEl = ref<HTMLElement | null>(null);
	const selected = ref(false);
	const { radius, angle, isReset, isDragging, cursor, onMouseDown, onWheel, resetToDefault } = useKnob(
		computed(() => props.value),
		computed(() => props.type ?? 'KnobMedium'),
		(value) => emit('change', value),
		knobCircle,
		computed(() => props.max ?? 127),
	);

	const { onMouseDown: onSpinMouseDown } = useSpinnerHoldInteraction(
		'KnobSpinV',
		0,
		() => props.value,
		(_index, value) => emit('change', value),
	);

	function onKnobMouseDown(event: MouseEvent) {
		selected.value = true;
		onMouseDown(event);
	}

	// A mousedown anywhere outside this knob deselects it.
	function onWindowMouseDown(e: MouseEvent) {
		if (!wrapperEl.value?.contains(e.target as Node)) selected.value = false;
	}

	// Capture phase + stopImmediatePropagation so the canvas handler (useModuleKeyboard) doesn't also act on the arrow key.
	function onWindowKeydown(e: KeyboardEvent) {
		if (!selected.value || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
		const el = document.activeElement;
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
		const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.altKey ? ALT_STEP : 1);
		const newValue = clamp(props.value + delta, 0, props.max ?? 127);
		if (newValue !== props.value) emit('change', newValue);
		e.preventDefault();
		e.stopImmediatePropagation();
	}

	onMounted(() => {
		window.addEventListener('mousedown', onWindowMouseDown);
		window.addEventListener('keydown', onWindowKeydown, true);
	});
	onUnmounted(() => {
		window.removeEventListener('mousedown', onWindowMouseDown);
		window.removeEventListener('keydown', onWindowKeydown, true);
	});
</script>
<style scoped>
	.knob-wrapper {
		display: block;
		user-select: none;
	}

	.knob-spin-v {
		cursor: pointer;
	}

	.knob-svg circle.dragging {
		stroke: #888;
		stroke-width: 1.5;
	}
</style>
