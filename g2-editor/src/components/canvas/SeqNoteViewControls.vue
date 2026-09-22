<template>
	<g class="select-none" font-size="7" fill="#333" data-testid="seqnote-view-controls">
		<!-- Magnifier: 3 stacked, directly-selectable zoom bands (real panel coords: x:217 y:24 w:11 h:91) -->
		<g v-for="band in zoomBands" :key="band.zoom">
			<rect
				:x="MAGNIFIER_BOX.x"
				:y="band.y"
				:width="MAGNIFIER_BOX.w"
				:height="bandHeight"
				:fill="band.zoom === view.zoom ? '#f80' : '#ccc'"
				stroke="#333"
				style="cursor: pointer"
				data-testid="seqnote-zoom-band"
				:data-zoom="band.zoom"
				:data-selected="band.zoom === view.zoom"
				@click="selectZoom(band.zoom)"
			/>
			<text :x="MAGNIFIER_BOX.x + MAGNIFIER_BOX.w / 2" :y="band.y + bandHeight / 2 + 2.5" text-anchor="middle" pointer-events="none">
				{{ band.zoom + 1 }}
			</text>
		</g>

		<!-- Octave offset stepper (real panel coords: x:231 y:40 w:21 h:25) -->
		<rect
			:x="OCTAVE_BOX.x"
			:y="OCTAVE_BOX.y"
			:width="OCTAVE_BOX.w"
			:height="OCTAVE_BOX.h / 2"
			:fill="canOctaveUp ? '#ccc' : '#e5e5e5'"
			stroke="#333"
			style="cursor: pointer"
			data-testid="seqnote-octave-up"
			@click="octaveUp"
		/>
		<polygon :points="upTrianglePoints" :fill="canOctaveUp ? '#555' : '#aaa'" pointer-events="none" />

		<rect
			:x="OCTAVE_BOX.x"
			:y="OCTAVE_BOX.y + OCTAVE_BOX.h / 2"
			:width="OCTAVE_BOX.w"
			:height="OCTAVE_BOX.h / 2"
			:fill="canOctaveDown ? '#ccc' : '#e5e5e5'"
			stroke="#333"
			style="cursor: pointer"
			data-testid="seqnote-octave-down"
			@click="octaveDown"
		/>
		<polygon :points="downTrianglePoints" :fill="canOctaveDown ? '#555' : '#aaa'" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { SEQNOTE_MAGNIFIER_BOX as MAGNIFIER_BOX, SEQNOTE_OCTAVE_BOX as OCTAVE_BOX, visibleOctaveCount, type PianoRollView } from '../../renderer/pianoRoll';

	const props = defineProps<{
		view: PianoRollView;
	}>();

	const emit = defineEmits<{
		change: [view: PianoRollView];
	}>();

	const bandHeight = MAGNIFIER_BOX.h / 3;
	// Top band = zoom 2 (3 octaves, most zoomed out), bottom band = zoom 0 (1 octave, most zoomed in).
	const zoomBands = [2, 1, 0].map((zoom, i) => ({ zoom: zoom as 0 | 1 | 2, y: MAGNIFIER_BOX.y + i * bandHeight }));

	function maxOctaveOffsetFor(zoom: PianoRollView['zoom']): number {
		return Math.max(0, Math.floor((128 - 12 * visibleOctaveCount(zoom)) / 12));
	}

	const canOctaveDown = computed(() => props.view.octaveOffset > 0);
	const canOctaveUp = computed(() => props.view.octaveOffset < maxOctaveOffsetFor(props.view.zoom));

	function selectZoom(zoom: 0 | 1 | 2) {
		if (zoom === props.view.zoom) return;
		const octaveOffset = Math.min(props.view.octaveOffset, maxOctaveOffsetFor(zoom));
		emit('change', { zoom, octaveOffset });
	}

	function octaveDown() {
		if (!canOctaveDown.value) return;
		emit('change', { ...props.view, octaveOffset: props.view.octaveOffset - 1 });
	}

	function octaveUp() {
		if (!canOctaveUp.value) return;
		emit('change', { ...props.view, octaveOffset: props.view.octaveOffset + 1 });
	}

	const upTrianglePoints = computed(() => {
		const cx = OCTAVE_BOX.x + OCTAVE_BOX.w / 2;
		const cy = OCTAVE_BOX.y + OCTAVE_BOX.h / 4;
		return `${cx - 4},${cy + 3} ${cx + 4},${cy + 3} ${cx},${cy - 3}`;
	});
	const downTrianglePoints = computed(() => {
		const cx = OCTAVE_BOX.x + OCTAVE_BOX.w / 2;
		const cy = OCTAVE_BOX.y + (OCTAVE_BOX.h * 3) / 4;
		return `${cx - 4},${cy - 3} ${cx + 4},${cy - 3} ${cx},${cy + 3}`;
	});
</script>
