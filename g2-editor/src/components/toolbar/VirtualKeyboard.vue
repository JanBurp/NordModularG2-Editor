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

		<div ref="keysEl" class="relative h-18 flex-1 bg-surface-1 overflow-hidden touch-none">
			<div
				v-for="k in keys"
				:key="k.note"
				class="absolute top-0 rounded-b-sm cursor-pointer"
				:class="k.black ? 'bg-black' : 'bg-white border border-neutral-400'"
				:style="keyStyle(k)"
				@pointerdown.prevent="pressKey(k.note)"
			>
				<div v-if="k.note % 12 === 0" class="absolute bottom-4 text-xs leading-none text-neutral-500 pointer-events-none w-full text-center">
					{{ midiNoteName(k.note) }}
				</div>
				<span
					v-if="k.note === soundingNote && dotVisible"
					class="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
					:class="k.black ? 'bg-white bottom-2' : 'bg-black bottom-4'"
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

	// Proportions and black-key placement follow a real keyboard (Wikimedia Commons PianoKeyboard.svg:
	// 23-wide white keys, 13×80 black keys on 120-high whites). Black keys aren't centred on the
	// white-key boundary: C#/D# lean outward within C–E, F#/G#/A# are spread across F–B.
	const WHITE_W = 22;
	const WHITE_H = 86;
	const BLACK_W_FRAC = 13 / 23;
	const BLACK_H_FRAC = 80 / 120;
	// Black key's left edge relative to the left edge of the white key just below it, in white-key widths.
	const BLACK_OFFSET: Record<number, number> = {
		1: 14.333 / 23,
		3: 18.667 / 23,
		6: 13.25 / 23,
		8: 16.25 / 23,
		10: 19.75 / 23,
	};
	const REPEAT_MS = 500; // A guess: the manual says only "play repeatedly" with no rate given.

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
		let whiteIdx = 0;
		let note = renderFirstNote.value;
		while (whiteIdx < visibleWhiteCount.value && note <= 127) {
			if (isBlackNote(note)) {
				result.push({ note, black: true, x: (whiteIdx - 1 + BLACK_OFFSET[note % 12]) * WHITE_W });
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
	const dotVisible = ref(true); // only ever false between Repeat strikes
	const drone = ref(false);
	const repeat = ref(false);
	let repeatTimer: ReturnType<typeof setInterval> | null = null;

	function silence() {
		if (soundingNote.value !== null) {
			device.playNote(soundingNote.value, false);
			soundingNote.value = null;
		}
		dotVisible.value = true;
	}

	function pressKey(note: number) {
		if (soundingNote.value === note) {
			// With Drone/Repeat a key latches: clicking the sounding key again turns it off.
			if (drone.value || repeat.value) silence();
			return;
		}
		if (soundingNote.value !== null) device.playNote(soundingNote.value, false);
		device.playNote(note, true);
		soundingNote.value = note;
		dotVisible.value = true;
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
		if (soundingNote.value === null || strikePending) return;
		strikePending = true;
		device.playNote(soundingNote.value, false);
		device.playNote(soundingNote.value, true).finally(() => (strikePending = false));
		dotVisible.value = true; // blink: visible for the first half of each repeat period
		setTimeout(() => {
			if (repeat.value) dotVisible.value = false;
		}, REPEAT_MS / 2);
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

	// Drone and Repeat are mutually exclusive. Switching from one to the other keeps the latched note
	// (now held, or now repeated); switching the active one off silences it.
	function toggleDrone() {
		drone.value = !drone.value;
		if (drone.value) {
			repeat.value = false;
			stopRepeatTimer();
			dotVisible.value = true;
		} else {
			silence();
		}
	}

	function toggleRepeat() {
		repeat.value = !repeat.value;
		if (repeat.value) {
			drone.value = false;
			// No immediate strike: stay silent until a key is clicked (or re-strike the note Drone was holding).
			startRepeatTimer();
		} else {
			stopRepeatTimer();
			silence();
		}
	}

	onMounted(() => {
		window.addEventListener('pointerup', releaseKey);
		window.addEventListener('pointercancel', releaseKey);
		if (keysEl.value) {
			resizeObserver = new ResizeObserver((entries) => {
				containerWidth.value = entries[0].contentRect.width;
			});
			resizeObserver.observe(keysEl.value);
		}
	});

	onUnmounted(() => {
		window.removeEventListener('pointerup', releaseKey);
		window.removeEventListener('pointercancel', releaseKey);
		resizeObserver?.disconnect();
		stopRepeatTimer();
		// Drone and Repeat deliberately do not survive a close, and any sounding note is silenced —
		// reopening the toolbar should never inherit a drone.
		silence();
	});
</script>
