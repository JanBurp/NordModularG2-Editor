<template>
	<div class="flex bg-surface-1 border-t border-line-subtle select-none" data-testid="virtual-keyboard">
		<div class="flex flex-col gap-2 px-2 py-2 border-line-subtle shrink-0 justify-between">
			<div class="flex gap-2 justify-between">
				<Button class="w-6" variant="default" size="small" @click="scrollBy(-12)">&lt;&lt;</Button>
				<Button class="w-6" variant="default" size="small" @click="scrollBy(-1)">&lt;</Button>
				<Button class="w-6" variant="default" size="small" @click="scrollBy(1)">&gt;</Button>
				<Button class="w-6" variant="default" size="small" @click="scrollBy(12)">&gt;&gt;</Button>
			</div>
			<div class="flex gap-1 justify-between">
				<Button variant="toggle" :active="drone" @click="toggleDrone">Drone</Button>
				<Button variant="toggle" :active="repeat" @click="toggleRepeat">Repeat</Button>
			</div>
		</div>

		<div ref="keysEl" class="relative h-18 flex-1 bg-surface-1 overflow-hidden">
			<div
				v-for="k in keys"
				:key="k.note"
				class="absolute top-0 rounded-b-sm cursor-pointer"
				:class="k.black ? 'bg-black' : 'bg-white border border-neutral-400'"
				:style="keyStyle(k)"
				@mousedown.prevent="pressKey(k.note)"
			>
				<div v-if="k.note % 12 === 0" class="absolute bottom-4 text-xs leading-none text-neutral-500 pointer-events-none w-full text-center">
					{{ midiNoteName(k.note) }}
				</div>
				<span
					v-if="k.note === soundingNote"
					class="absolute left-1/2 -translate-x-1/2 bottom-1 w-1.5 h-1.5 rounded-full"
					:class="k.black ? 'bg-white' : 'bg-black'"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref } from 'vue';
	import Button from './Button.vue';
	import { useDeviceStore } from '../../store/device';
	import { MidiNote as midiNoteName } from '../../renderer/parammap';
	import { isBlackNote } from '../../renderer/pianoRoll';

	interface KeyInfo {
		note: number;
		black: boolean;
		x: number;
	}

	// Geometry matches the reference Virtual Keyboard implementation (other-approaches/G2-Edit) for
	// visual fidelity: 22px white keys, black keys 62% of a white key's width/height, centred over
	// the boundary between the two white keys they sit above.
	const WHITE_W = 22;
	const WHITE_H = 86;
	const BLACK_W_FRAC = 0.62;
	const BLACK_H_FRAC = 0.62;
	const REPEAT_MS = 250; // A guess: the manual says only "play repeatedly" with no rate given.

	const device = useDeviceStore();

	const keysEl = ref<HTMLElement | null>(null);
	const containerWidth = ref(600);
	let resizeObserver: ResizeObserver | null = null;

	const visibleWhiteCount = computed(() => Math.max(7, Math.floor(containerWidth.value / WHITE_W)));

	const firstNote = ref(48); // C3 — default span is roughly C3..the visible width, middle of the range

	function whiteCountFrom(note: number): number {
		let count = 0;
		for (let n = note; n <= 127; n++) if (!isBlackNote(n)) count++;
		return count;
	}

	// firstNote is the scroll position the user set; if the window is wider than what's needed to
	// reach note 127 from there, pull the start down to actually use the extra width instead of
	// leaving it blank — capped at 0, since note 127 is a real ceiling (there are no higher notes).
	// Steps a full octave at a time (not note-by-note) so the leftmost note only ever changes in
	// whole-octave jumps as the window resizes, instead of drifting unpredictably.
	const renderFirstNote = computed(() => {
		let start = firstNote.value;
		while (start > 0 && whiteCountFrom(start) < visibleWhiteCount.value) start = Math.max(0, start - 12);
		return start;
	});

	const keys = computed<KeyInfo[]>(() => {
		const result: KeyInfo[] = [];
		const blackW = WHITE_W * BLACK_W_FRAC;
		let whiteIdx = 0;
		let note = renderFirstNote.value;
		while (whiteIdx < visibleWhiteCount.value && note <= 127) {
			if (isBlackNote(note)) {
				result.push({ note, black: true, x: whiteIdx * WHITE_W - blackW / 2 });
			} else {
				result.push({ note, black: false, x: whiteIdx * WHITE_W });
				whiteIdx++;
			}
			note++;
		}
		return result;
	});

	function keyStyle(k: KeyInfo) {
		if (!k.black) return { left: `${k.x}px`, width: `${WHITE_W}px`, height: `${WHITE_H}px`, zIndex: 1 };
		return { left: `${k.x}px`, width: `${WHITE_W * BLACK_W_FRAC}px`, height: `${WHITE_H * BLACK_H_FRAC}px`, zIndex: 2 };
	}

	const soundingNote = ref<number | null>(null);
	const lastNote = ref<number | null>(null);
	const drone = ref(false);
	const repeat = ref(false);
	let repeatTimer: ReturnType<typeof setInterval> | null = null;

	function silence() {
		if (soundingNote.value !== null) {
			device.playNote(soundingNote.value, false);
			soundingNote.value = null;
		}
	}

	function pressKey(note: number) {
		if (soundingNote.value === note) return;
		if (soundingNote.value !== null) device.playNote(soundingNote.value, false);
		device.playNote(note, true);
		soundingNote.value = note;
		lastNote.value = note;
		if (repeat.value) startRepeatTimer(); // fresh press resets the re-strike window, matching the reference
	}

	function releaseKey() {
		// Mirrors the reference: a key release only silences the note when neither Drone nor Repeat
		// is engaged — that's exactly what those two toggles mean.
		if (drone.value || repeat.value) return;
		silence();
	}

	function scrollBy(semitones: number) {
		silence(); // the sounding key may be about to scroll out of view
		firstNote.value = Math.max(0, Math.min(127, firstNote.value + semitones));
	}

	// The daemon runs commands one at a time, so a strike is skipped while the previous one is still
	// in flight — otherwise a slow device lets the timer pile up an unbounded backlog that outlives
	// Repeat being switched off and delays every other command (e.g. Save to Synth).
	let strikePending = false;

	function strikeRepeat() {
		if (lastNote.value === null || strikePending) return;
		strikePending = true;
		if (soundingNote.value !== null) device.playNote(soundingNote.value, false);
		device.playNote(lastNote.value, true).finally(() => (strikePending = false));
		soundingNote.value = lastNote.value;
	}

	function startRepeatTimer() {
		stopRepeatTimer();
		repeatTimer = setInterval(strikeRepeat, REPEAT_MS);
	}

	function stopRepeatTimer() {
		if (repeatTimer !== null) {
			clearInterval(repeatTimer);
			repeatTimer = null;
		}
	}

	function toggleDrone() {
		drone.value = !drone.value;
		if (!drone.value && !repeat.value) silence();
	}

	function toggleRepeat() {
		repeat.value = !repeat.value;
		if (repeat.value) {
			strikeRepeat();
			startRepeatTimer();
		} else {
			stopRepeatTimer();
			if (!drone.value) silence();
		}
	}

	onMounted(() => {
		window.addEventListener('mouseup', releaseKey);
		if (keysEl.value) {
			resizeObserver = new ResizeObserver((entries) => {
				containerWidth.value = entries[0].contentRect.width;
			});
			resizeObserver.observe(keysEl.value);
		}
	});

	onUnmounted(() => {
		window.removeEventListener('mouseup', releaseKey);
		resizeObserver?.disconnect();
		stopRepeatTimer();
		// Drone and Repeat deliberately do not survive a close, and any sounding note is silenced —
		// reopening the toolbar should never inherit a drone.
		silence();
	});
</script>
