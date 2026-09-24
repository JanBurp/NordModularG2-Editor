// Shared constants/helpers for SeqNote's piano-roll step editor. Kept separate from nmg2mods.ts
// since this concerns the *view* of SeqNote's step data, not the module definition itself.

export const SEQNOTE_MODULE_TYPE = 121;

// `zoom` is the raw hardware byte (0-2, cycled by the original CPnlNoteSeqZoom widget) — stored
// byte-faithful to real hardware-saved patches, not a visible-octave count.
export interface PianoRollView {
	zoom: 0 | 1 | 2;
	octaveOffset: number;
}

// Matches the original hardware editor's CPnlNoteSeqZoom/CPnlNoteSeqOffset widget init values
// (offset 0x84 inits to 1 — the middle of its 0-2 range; offset 0x159 inits to 5) — confirmed
// against a real fixture (test-patches/Mixturtrautonium.pch2) that never had either control
// touched.
export const DEFAULT_PIANO_ROLL_VIEW: PianoRollView = { zoom: 1, octaveOffset: 5 };

// Hardware caps octaveOffset at a flat 9 regardless of zoom (reverse-engineered from
// CPnlNoteSeqOffset::HandleChangeRequests's `if ((byte)this[0x159] < 9)` in G2Editor.c).
export const SEQNOTE_MAX_OCTAVE_OFFSET = 9;

export interface NoteWindow {
	low: number;
	high: number;
}

// Reverse-engineered from CSeqSliderGUI::SetZoom/SetOffset/GetLowLimit/GetRange in G2Editor.c:
// zoom 0 shows 3 octaves (most zoomed OUT), zoom 2 shows 1 octave (most zoomed IN) — the opposite
// of a naive zoom+1 mapping. The window's top is always octaveOffset*12+12 regardless of zoom
// (12*(2-zoom) semitones are added below it); a low bound under note 0 is clipped by shrinking
// the window rather than shifting it, matching CPnlNoteSeqClrRnd::GetRequestedChange's own clamp.
export function visibleNoteWindow(zoom: PianoRollView['zoom'], octaveOffset: number): NoteWindow {
	let span = 12 * (3 - zoom) + 1;
	let low = octaveOffset * 12 - 12 * (2 - zoom);
	if (low < 0) {
		span += low;
		low = 0;
	}
	return { low, high: low + span - 1 };
}

// SeqNote's step-grid box (nmg2mods.ts's `ve` line entries for module id 121: x:25-218, y:39-115)
// and the step columns' fixed 12-unit spacing (Seq1StepN.x values).
export const SEQNOTE_STRIP_TOP = 39;
export const SEQNOTE_STRIP_HEIGHT = 76;
export const SEQNOTE_STEP_WIDTH = 12;

// The Magnifier/Octave-offset widgets' real panel coordinates, extracted from the original
// editor's own panel-resource file (other-approaches/G2-ReverseEngineered/graphics and more/
// panl/876.txt, Graph Func:25 and Func:26 — the same 0x19/0x1a factory-case values found in
// G2Editor.c), cross-checked against nmg2mods.ts's own coordinates for id 121 (e.g. "Rec" text
// at 81,12 matches the panel file's XPos:82/YPos:5). Also present, commented-out, at the tail of
// nmg2mods.ts's own `ve` array for id 121. The magnifier column (x:217-228, y:24-115) is split
// here into a button on top and a keyboard graphic below it, aligned with the step grid's own
// top/height so the keyboard's rows line up exactly with SeqNoteStepStrip's rows.
export const SEQNOTE_MAGNIFIER_BUTTON_BOX = { x: 217, y: 24, w: 11, h: SEQNOTE_STRIP_TOP - 24 };
export const SEQNOTE_KEYBOARD_BOX = { x: 217, y: SEQNOTE_STRIP_TOP, w: 11, h: SEQNOTE_STRIP_HEIGHT };
export const SEQNOTE_OCTAVE_BOX = { x: 231, y: 40, w: 21, h: 25 };

const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

export function isBlackNote(note: number): boolean {
	return IS_BLACK[((note % 12) + 12) % 12];
}

// Shared by SeqNoteStepStrip (per-step background rows) and SeqNoteViewControls (the keyboard
// graphic) so both draw black notes from the same top-down row math.
export function blackNoteRowYs(top: number, rowHeight: number, highestVisibleNote: number, visibleSemitoneCount: number): number[] {
	const ys: number[] = [];
	for (let rowIndexFromTop = 0; rowIndexFromTop < visibleSemitoneCount; rowIndexFromTop++) {
		const note = highestVisibleNote - rowIndexFromTop;
		if (isBlackNote(note)) ys.push(top + rowIndexFromTop * rowHeight);
	}
	return ys;
}
