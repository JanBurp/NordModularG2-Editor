<template>
	<g class="select-none" font-size="7" fill="#333" data-testid="seqnote-view-controls">
		<!-- Magnifier button: cycles zoom 0->1->2->0 (real panel coords: x:217 y:24 w:11 h:15) -->
		<rect
			:x="MAGNIFIER_BUTTON_BOX.x"
			:y="MAGNIFIER_BUTTON_BOX.y"
			:width="MAGNIFIER_BUTTON_BOX.w"
			:height="MAGNIFIER_BUTTON_BOX.h"
			fill="#FFF"
			stroke="#333"
			style="cursor: pointer"
			data-testid="seqnote-magnifier-button"
			:data-zoom="view.zoom"
			@click="cycleZoom"
		/>
		<circle :cx="LENS_CX" :cy="LENS_CY" :r="LENS_R" fill="none" stroke="#333" pointer-events="none" />
		<line :x1="HANDLE_X1" :y1="HANDLE_Y1" :x2="HANDLE_X2" :y2="HANDLE_Y2" stroke="#333" pointer-events="none" />

		<!-- Keyboard graphic: key rows follow the current zoom/octave, aligned with SeqNoteStepStrip's rows -->
		<rect
			:x="KEYBOARD_BOX.x"
			:y="KEYBOARD_BOX.y"
			:width="KEYBOARD_BOX.w"
			:height="KEYBOARD_BOX.h"
			fill="#fff"
			stroke="#333"
			pointer-events="none"
			data-testid="seqnote-keyboard"
		/>
		<rect
			v-for="y in blackKeyYs"
			:key="y"
			:x="KEYBOARD_BOX.x"
			:y="y"
			:width="KEYBOARD_BOX.w * 0.6"
			:height="keyRowHeight"
			fill="#000"
			pointer-events="none"
		/>

		<!-- Octave offset display + horizontal stepper (real panel coords: x:231 y:40 w:21 h:25) -->
		<text :x="OCTAVE_BOX.x + OCTAVE_BOX.w / 2" :y="OCTAVE_BOX.y + 7" text-anchor="middle" data-testid="seqnote-octave-display" pointer-events="none">
			{{ octaveLabel }}
		</text>

		<rect
			:x="OCTAVE_BOX.x"
			:y="BUTTONS_Y"
			:width="OCTAVE_BOX.w / 2"
			:height="BUTTONS_HEIGHT"
			:fill="canOctaveDown ? '#ccc' : '#e5e5e5'"
			stroke="#333"
			style="cursor: pointer"
			data-testid="seqnote-octave-down"
			@click="octaveDown"
		/>
		<polygon :points="LEFT_TRIANGLE_POINTS" :fill="canOctaveDown ? '#555' : '#aaa'" pointer-events="none" />

		<rect
			:x="OCTAVE_BOX.x + OCTAVE_BOX.w / 2"
			:y="BUTTONS_Y"
			:width="OCTAVE_BOX.w / 2"
			:height="BUTTONS_HEIGHT"
			:fill="canOctaveUp ? '#ccc' : '#e5e5e5'"
			stroke="#333"
			style="cursor: pointer"
			data-testid="seqnote-octave-up"
			@click="octaveUp"
		/>
		<polygon :points="RIGHT_TRIANGLE_POINTS" :fill="canOctaveUp ? '#555' : '#aaa'" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import {
		SEQNOTE_MAGNIFIER_BUTTON_BOX as MAGNIFIER_BUTTON_BOX,
		SEQNOTE_KEYBOARD_BOX as KEYBOARD_BOX,
		SEQNOTE_OCTAVE_BOX as OCTAVE_BOX,
		SEQNOTE_MAX_OCTAVE_OFFSET,
		visibleNoteWindow,
		blackNoteRowYs,
		type PianoRollView,
	} from '../../renderer/pianoRoll';

	const props = defineProps<{
		view: PianoRollView;
	}>();

	const emit = defineEmits<{
		change: [view: PianoRollView];
	}>();

	const canOctaveDown = computed(() => props.view.octaveOffset > 0);
	const canOctaveUp = computed(() => props.view.octaveOffset < SEQNOTE_MAX_OCTAVE_OFFSET);

	function cycleZoom() {
		const zoom = ((props.view.zoom + 1) % 3) as 0 | 1 | 2;
		emit('change', { zoom, octaveOffset: props.view.octaveOffset });
	}

	function octaveDown() {
		if (!canOctaveDown.value) return;
		emit('change', { ...props.view, octaveOffset: props.view.octaveOffset - 1 });
	}

	function octaveUp() {
		if (!canOctaveUp.value) return;
		emit('change', { ...props.view, octaveOffset: props.view.octaveOffset + 1 });
	}

	// The window's top is always anchored at a "C" (octaveOffset*12+12 is always a multiple of 12),
	// so octaveOffset itself is the anchor's octave number, e.g. octaveOffset=5 (default) -> "C5".
	const octaveLabel = computed(() => `C${props.view.octaveOffset}`);

	// Magnifier icon: simple lens + handle, centered in the button.
	const LENS_CX = MAGNIFIER_BUTTON_BOX.x + MAGNIFIER_BUTTON_BOX.w / 2 - 1;
	const LENS_CY = MAGNIFIER_BUTTON_BOX.y + MAGNIFIER_BUTTON_BOX.h / 2 - 1;
	const LENS_R = 2.3;
	const HANDLE_X1 = LENS_CX + LENS_R * 0.7;
	const HANDLE_Y1 = LENS_CY + LENS_R * 0.7;
	const HANDLE_X2 = LENS_CX + LENS_R * 1.8;
	const HANDLE_Y2 = LENS_CY + LENS_R * 1.8;

	// Keyboard graphic: same row math as SeqNoteStepStrip, applied to the keyboard's own box.
	const noteWindow = computed(() => visibleNoteWindow(props.view.zoom, props.view.octaveOffset));
	const visibleSemitoneCount = computed(() => noteWindow.value.high - noteWindow.value.low + 1);
	const keyRowHeight = computed(() => KEYBOARD_BOX.h / visibleSemitoneCount.value);
	const blackKeyYs = computed(() => blackNoteRowYs(KEYBOARD_BOX.y, keyRowHeight.value, noteWindow.value.high, visibleSemitoneCount.value));

	const BUTTONS_Y = OCTAVE_BOX.y + 10;
	const BUTTONS_HEIGHT = OCTAVE_BOX.h - 10;
	const LEFT_TRIANGLE_POINTS = (() => {
		const cx = OCTAVE_BOX.x + OCTAVE_BOX.w / 4;
		const cy = BUTTONS_Y + BUTTONS_HEIGHT / 2;
		return `${cx + 3},${cy - 4} ${cx + 3},${cy + 4} ${cx - 3},${cy}`;
	})();
	const RIGHT_TRIANGLE_POINTS = (() => {
		const cx = OCTAVE_BOX.x + (OCTAVE_BOX.w * 3) / 4;
		const cy = BUTTONS_Y + BUTTONS_HEIGHT / 2;
		return `${cx - 3},${cy - 4} ${cx - 3},${cy + 4} ${cx + 3},${cy}`;
	})();
</script>
