import { SEQNOTE_STRIP_HEIGHT, SEQNOTE_STRIP_TOP, visibleNoteWindow, type PianoRollView } from '../renderer/pianoRoll';
import { clamp } from './math';

// Slider (KnobSlider, ModuleSlider.vue): the 6-unit handle's top runs 0..42 for values 127..0.
export function sliderValueAtY(y: number): number {
	return clamp(Math.round(127 - ((y - 3) / 42) * 127), 0, 127);
}

// SeqNote step strip (SeqNoteStepStrip.vue): the note of the piano-roll row under `y` (module coordinates).
export function seqNoteAtY(y: number, view: PianoRollView): number {
	const { low, high } = visibleNoteWindow(view.zoom, view.octaveOffset);
	const rows = high - low + 1;
	const row = clamp(Math.floor((y - SEQNOTE_STRIP_TOP) / (SEQNOTE_STRIP_HEIGHT / rows)), 0, rows - 1);
	return high - row;
}

// Knob (utils/knobArc.ts, the inverse of knobAngle): the value at the arc angle of a click `dx`/`dy` from the
// knob's centre (0° = top, clockwise). The arc spans -135°..135°: the gap at the bottom clamps to the nearer end.
export function knobValueAtOffset(dx: number, dy: number): number {
	const angle = clamp((Math.atan2(dx, -dy) * 180) / Math.PI, -135, 135);
	return clamp(Math.round(((angle + 135) / 270) * 128), 0, 127);
}

// The morph range a Ctrl-click assigns: from the param's current value to the value clicked, so the clicked
// position is where the morph ends. Clicking the current value (range 0) says nothing: the full range.
export function morphRangeFromClick(clicked: number, current: number): number {
	return clicked === current ? 127 : clicked - current;
}
