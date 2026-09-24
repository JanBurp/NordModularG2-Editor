<template>
	<g data-testid="seqnote-step" :data-param-index="paramIndex" :data-value="value" @contextmenu.stop.prevent="emit('paramContextMenu', paramIndex, $event)">
		<rect
			:x="x"
			:y="stripTop"
			:width="width"
			:height="stripHeight"
			fill="#ddd"
			stroke="#999"
			style="cursor: ns-resize"
			data-testid="seqnote-step-strip"
			@mousedown="onMouseDown"
		/>
		<rect v-for="y in blackRowYs" :key="y" :x="x" :y="y" :width="width" :height="rowHeight" fill="#999" pointer-events="none" />
		<!-- Morph range span, only for the currently selected group's assignment — same visual language as ModuleSlider -->
		<rect v-if="morphSpan" :x="x" :y="morphSpan.y" :width="width" :height="morphSpan.height" :fill="morphFillColor" opacity="0.35" pointer-events="none" />
		<rect
			v-if="valueInRange"
			:x="x"
			:y="valueRowY"
			:width="width"
			:height="rowHeight"
			:fill="morphFillColor"
			pointer-events="none"
			data-testid="seqnote-step-value-highlight"
		/>
		<polygon v-if="outOfRangeAbove" :points="topTrianglePoints" :fill="morphFillColor" pointer-events="none" />
		<polygon v-if="outOfRangeBelow" :points="bottomTrianglePoints" :fill="morphFillColor" pointer-events="none" />
		<rect v-if="highlight" :x="x" :y="stripTop + stripHeight" :width="width" height="2" fill="white" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { blackNoteRowYs, visibleNoteWindow } from '../../renderer/pianoRoll';
	import { usePianoRollNoteInteraction } from '../../composables/usePianoRollNoteInteraction';
	import { clamp } from '../../utils/math';
	import { morphColorHex } from '../../utils/morphColors';

	const props = defineProps<{
		paramIndex: number;
		value: number;
		x: number;
		width: number;
		stripTop: number;
		stripHeight: number;
		zoom: 0 | 1 | 2;
		octaveOffset: number;
		highlight?: boolean;
		morphColor?: 'red' | 'blue' | null;
		morphRange?: number;
	}>();

	const emit = defineEmits<{
		change: [paramIndex: number, value: number];
		paramContextMenu: [paramIndex: number, event: MouseEvent];
	}>();

	const morphFillColor = computed(() => morphColorHex(props.morphColor, '#000'));

	const noteWindow = computed(() => visibleNoteWindow(props.zoom, props.octaveOffset));
	const lowestVisibleNote = computed(() => noteWindow.value.low);
	const highestVisibleNote = computed(() => noteWindow.value.high);
	const visibleSemitoneCount = computed(() => highestVisibleNote.value - lowestVisibleNote.value + 1);
	const rowHeight = computed(() => props.stripHeight / visibleSemitoneCount.value);

	const blackRowYs = computed(() => blackNoteRowYs(props.stripTop, rowHeight.value, highestVisibleNote.value, visibleSemitoneCount.value));

	const clampedValue = computed(() => clamp(props.value, 0, 127));
	const valueInRange = computed(() => clampedValue.value >= lowestVisibleNote.value && clampedValue.value <= highestVisibleNote.value);
	const valueRowY = computed(() => {
		const rowIndexFromTop = highestVisibleNote.value - clampedValue.value;
		return props.stripTop + rowIndexFromTop * rowHeight.value;
	});

	const outOfRangeAbove = computed(() => clampedValue.value > highestVisibleNote.value);
	const outOfRangeBelow = computed(() => clampedValue.value < lowestVisibleNote.value);

	// Same idea as ModuleSlider's morph range span, translated from a linear px position to rows:
	// spans from the current value's row to the morphed target's row, clamped to the visible window.
	const morphSpan = computed(() => {
		if (props.morphRange === undefined) return null;
		const target = clamp(clampedValue.value + props.morphRange, 0, 127);
		const rowA = clamp(highestVisibleNote.value - clampedValue.value, 0, visibleSemitoneCount.value - 1);
		const rowB = clamp(highestVisibleNote.value - target, 0, visibleSemitoneCount.value - 1);
		const top = Math.min(rowA, rowB);
		const bottom = Math.max(rowA, rowB);
		return { y: props.stripTop + top * rowHeight.value, height: (bottom - top + 1) * rowHeight.value };
	});

	const centerX = computed(() => props.x + props.width / 2);
	const topTrianglePoints = computed(() => {
		const cx = centerX.value;
		const y = props.stripTop;
		return `${cx - 3},${y + 4} ${cx + 3},${y + 4} ${cx},${y - 1}`;
	});
	const bottomTrianglePoints = computed(() => {
		const cx = centerX.value;
		const y = props.stripTop + props.stripHeight;
		return `${cx - 3},${y - 4} ${cx + 3},${y - 4} ${cx},${y + 1}`;
	});

	const { onMouseDown } = usePianoRollNoteInteraction((localY) => {
		const rowIndexFromTop = clamp(Math.floor((localY - props.stripTop) / rowHeight.value), 0, visibleSemitoneCount.value - 1);
		emit('change', props.paramIndex, highestVisibleNote.value - rowIndexFromTop);
	});
</script>
