<template>
	<div class="flex items-center gap-2 flex-1">
		<div
			ref="trackRef"
			role="slider"
			tabindex="0"
			:aria-valuemin="min"
			:aria-valuemax="max"
			:aria-valuenow="modelValue"
			aria-orientation="horizontal"
			class="relative flex-1 h-1.5 rounded-xs bg-surface-3 cursor-pointer touch-none select-none focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-1 focus:ring-offset-surface-0"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerUp"
			@keydown.left.prevent="emitValue(modelValue - step)"
			@keydown.down.prevent="emitValue(modelValue - step)"
			@keydown.right.prevent="emitValue(modelValue + step)"
			@keydown.up.prevent="emitValue(modelValue + step)"
			@keydown.home.prevent="emitValue(min)"
			@keydown.end.prevent="emitValue(max)"
		>
			<div class="absolute inset-y-0 left-0 rounded-xs bg-input pointer-events-none" :style="{ width: percent + '%' }" />
			<div
				class="absolute top-1/2 w-3 h-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-surface-2 border border-line-default shadow-sm pointer-events-none"
				:style="{ left: percent + '%' }"
			/>
		</div>
		<span class="text-xs text-content-secondary w-8 text-right shrink-0">{{ modelValue }}</span>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';
	import { clamp } from '@/utils/math';

	const props = withDefaults(
		defineProps<{
			modelValue: number;
			min: number;
			max: number;
			step?: number;
		}>(),
		{ step: 1 },
	);

	const emit = defineEmits<{
		'update:modelValue': [value: number];
	}>();

	const trackRef = ref<HTMLDivElement | null>(null);
	const percent = computed(() => clamp(((props.modelValue - props.min) / (props.max - props.min)) * 100, 0, 100));

	function roundToStep(value: number): number {
		const snapped = props.min + Math.round((value - props.min) / props.step) * props.step;
		return clamp(Number(snapped.toFixed(6)), props.min, props.max);
	}

	function emitValue(value: number) {
		const next = roundToStep(value);
		if (next !== props.modelValue) emit('update:modelValue', next);
	}

	function valueFromPointer(clientX: number): number {
		const rect = trackRef.value!.getBoundingClientRect();
		const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
		return props.min + ratio * (props.max - props.min);
	}

	function onPointerDown(event: PointerEvent) {
		const el = event.currentTarget as HTMLElement;
		el.setPointerCapture(event.pointerId);
		el.focus();
		emitValue(valueFromPointer(event.clientX));
	}

	function onPointerMove(event: PointerEvent) {
		if (event.buttons !== 1) return;
		emitValue(valueFromPointer(event.clientX));
	}

	function onPointerUp(event: PointerEvent) {
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}
</script>
