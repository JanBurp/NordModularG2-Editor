import { SEQNOTE_STRIP_HEIGHT, SEQNOTE_STRIP_TOP, visibleNoteWindow, type PianoRollView } from '../renderer/pianoRoll';
import { getParam } from '../renderer/parammap';
import { RADII } from '../composables/useKnob';
import type { ModuleParam } from '../types';
import { isKnob, isSlider } from './moduleControls';
import { clamp } from './math';

// Slider (KnobSlider, ModuleSlider.vue): the 6-unit handle's top runs 0..SLIDER_TRAVEL for values 127..0.
const SLIDER_TRAVEL = 42;
const SLIDER_HANDLE_CENTRE = 3;

export function sliderYForValue(value: number): number {
	return ((127 - clamp(value, 0, 127)) / 127) * SLIDER_TRAVEL;
}

export function sliderValueAtY(y: number): number {
	return clamp(Math.round(127 - ((y - SLIDER_HANDLE_CENTRE) / SLIDER_TRAVEL) * 127), 0, 127);
}

// SeqNote step strip (SeqNoteStepStrip.vue): the note of the piano-roll row under `y` (module coordinates).
export function seqNoteAtY(y: number, view: PianoRollView, top = SEQNOTE_STRIP_TOP, height = SEQNOTE_STRIP_HEIGHT): number {
	const { low, high } = visibleNoteWindow(view.zoom, view.octaveOffset);
	const rows = high - low + 1;
	const row = clamp(Math.floor((y - top) / (height / rows)), 0, rows - 1);
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

// The range a Ctrl-click at (x, y) (module coordinates) assigns to `param`, whose value is `current`.
// SeqNote steps follow the original editor (CPnlSeqSlider::OnClick: delta = clicked note - value). Knobs (0..127
// only, like MorphKnobOverlay's sector) and sliders are our own extension: the original only sets their range by
// dragging. A knob's centre and all other controls give the full range.
export function clickMorphRange(param: ModuleParam, x: number, y: number, current: number, view: PianoRollView): number {
	if (isKnob(param.n) && getParam(param.type)?.high === 127) {
		// The knob's circle is centred at (radius + 2) inside its group (ModuleKnob.vue); its centre has no angle.
		const centre = (RADII[param.n] ?? 10) + 2;
		const dx = x - (param.x + centre);
		const dy = y - (param.y + centre);
		return Math.hypot(dx, dy) < 2 ? 127 : morphRangeFromClick(knobValueAtOffset(dx, dy), current);
	}
	if (isSlider(param.n)) return morphRangeFromClick(sliderValueAtY(y - param.y), current);
	if (param.n === 'KnobSeqSlider') return morphRangeFromClick(seqNoteAtY(y, view), current);
	return 127;
}
