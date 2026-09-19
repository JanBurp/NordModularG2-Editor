<template>
	<g class="drum-synth-preset" data-testid="drumsynth-preset">
		<rect :x="ve.x" :y="ve.y" :width="ve.w" :height="ve.h" :fill="GRAPH_COLORS.bg" />
		<text
			:x="centerX"
			:y="centerY + 1"
			:fill="GRAPH_COLORS.label"
			font-size="10"
			text-anchor="middle"
			dominant-baseline="middle"
			pointer-events="none"
			data-testid="drumsynth-preset-name"
		>
			{{ displayName }}
		</text>
		<polygon :points="leftChevron" fill="#AFA" pointer-events="none" />
		<polygon :points="rightChevron" fill="#AFA" pointer-events="none" />
		<rect
			:x="ve.x"
			:y="ve.y"
			:width="arrowZoneW"
			:height="ve.h"
			fill="transparent"
			style="cursor: pointer"
			data-testid="drumsynth-preset-prev"
			@click.stop="onPrev"
		/>
		<rect
			:x="rightZoneX"
			:y="ve.y"
			:width="arrowZoneW"
			:height="ve.h"
			fill="transparent"
			style="cursor: pointer"
			data-testid="drumsynth-preset-next"
			@click.stop="onNext"
		/>
		<rect
			:x="x0 + arrowZoneW"
			:y="ve.y"
			:width="w - 2 * arrowZoneW"
			:height="ve.h"
			fill="transparent"
			style="cursor: pointer"
			data-testid="drumsynth-preset-open"
			@click.stop="onOpenDropdown"
		/>
	</g>
</template>
<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import type { VisualElement } from '../../types';
	import { DRUM_SYNTH_PRESETS, findDrumSynthPresetIndex } from '../../renderer/drumSynthPresets';
	import { GRAPH_COLORS } from './graphFunctions';
	import { useDrumSynthPresetDropdown } from '../../composables/useDrumSynthPresetDropdown';

	const props = defineProps<{
		ve: VisualElement;
		lv?: number[];
	}>();

	const emit = defineEmits<{
		apply: [values: number[]];
	}>();

	const arrowZoneW = 9;

	const x0 = computed(() => props.ve.x ?? 0);
	const y0 = computed(() => props.ve.y ?? 0);
	const w = computed(() => props.ve.w ?? 0);
	const h = computed(() => props.ve.h ?? 0);
	const centerX = computed(() => x0.value + w.value / 2);
	const centerY = computed(() => y0.value + h.value / 2);
	const rightZoneX = computed(() => x0.value + w.value - arrowZoneW);

	const leftChevron = computed(() => {
		const cx = x0.value + arrowZoneW / 2;
		const cy = centerY.value;
		return `${cx + 3},${cy - 5} ${cx + 3},${cy + 5} ${cx - 3},${cy}`;
	});
	const rightChevron = computed(() => {
		const cx = rightZoneX.value + arrowZoneW / 2;
		const cy = centerY.value;
		return `${cx - 3},${cy - 5} ${cx - 3},${cy + 5} ${cx + 3},${cy}`;
	});

	const matchedIndex = computed(() => findDrumSynthPresetIndex((props.lv ?? []).slice(0, 15)));
	const displayName = computed(() => (matchedIndex.value >= 0 ? DRUM_SYNTH_PRESETS[matchedIndex.value].name : 'none'));

	// The stepper's position has to survive drifting into "none" (matchedIndex === -1), otherwise
	// there's nothing left to step from and the arrows get stuck once any knob is tweaked. Tracks the
	// last preset that was actually matched (defaulting to 0 for a module that's never matched one),
	// and next/prev always step relative to that remembered position, not the possibly-unmatched one.
	const lastIndex = ref(Math.max(matchedIndex.value, 0));
	watch(matchedIndex, (v) => {
		if (v >= 0) lastIndex.value = v;
	});

	function onPrev() {
		if (lastIndex.value <= 0) return;
		emit('apply', DRUM_SYNTH_PRESETS[lastIndex.value - 1].values);
	}
	function onNext() {
		if (lastIndex.value >= DRUM_SYNTH_PRESETS.length - 1) return;
		emit('apply', DRUM_SYNTH_PRESETS[lastIndex.value + 1].values);
	}

	// Clicking the name (the dead zone between the two chevrons) opens a dropdown of all 30 presets
	// for fast selection, instead of stepping one at a time. The dropdown itself mounts once at the
	// app root (see useDrumSynthPresetDropdown.ts) — Teleport-ing directly from inside this
	// component's own <g> would create its content in the SVG namespace, rendering invisible once
	// moved to <body>.
	function onOpenDropdown(e: MouseEvent) {
		const target = e.currentTarget as SVGRectElement;
		const ctm = target.getScreenCTM();
		const bottomLeft = ctm ? new DOMPoint(x0.value, y0.value + h.value).matrixTransform(ctm) : { x: 0, y: 0 };
		useDrumSynthPresetDropdown().open(bottomLeft.x, bottomLeft.y, lastIndex.value, (index) => {
			emit('apply', DRUM_SYNTH_PRESETS[index].values);
		});
	}
</script>
