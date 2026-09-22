// Shared constants/helpers for SeqNote's piano-roll step editor. Kept separate from nmg2mods.ts
// since this concerns the *view* of SeqNote's step data, not the module definition itself.

export const SEQNOTE_MODULE_TYPE = 121;

// `zoom` is the raw hardware byte (0-2, cycled by the original CPnlNoteSeqZoom widget) — NOT a
// visible-octave count. Visible octaves = zoom+1 (1/2/3), computed wherever needed rather than
// stored, so the stored value stays byte-faithful to real hardware-saved patches.
export interface PianoRollView {
	zoom: 0 | 1 | 2;
	octaveOffset: number;
}

// Matches the original hardware editor's CPnlNoteSeqZoom/CPnlNoteSeqOffset widget init values
// (offset 0x84 inits to 1 — the middle of its 0-2 range, i.e. 2 visible octaves; offset 0x159
// inits to 5) — confirmed against a real fixture (test-patches/Mixturtrautonium.pch2) that never
// had either control touched.
export const DEFAULT_PIANO_ROLL_VIEW: PianoRollView = { zoom: 1, octaveOffset: 5 };

export function visibleOctaveCount(zoom: PianoRollView['zoom']): number {
	return zoom + 1;
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
// nmg2mods.ts's own `ve` array for id 121.
export const SEQNOTE_MAGNIFIER_BOX = { x: 217, y: 24, w: 11, h: 91 };
export const SEQNOTE_OCTAVE_BOX = { x: 231, y: 40, w: 21, h: 25 };

const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

export function isBlackNote(note: number): boolean {
	return IS_BLACK[((note % 12) + 12) % 12];
}
