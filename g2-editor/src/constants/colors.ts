// The one place for the colours of module panels and the patch canvas: the G2 look, the same in light
// and dark mode. App UI colours (toolbars, panes, dark mode) are the theme variables in style.css.

import type { CableColor } from './cableColors';

// Shared by the module graphs and the KnobReset marker.
const GRAPH_GREEN = '#AFA';
const GRAPH_TEAL = '#088';
const GRAPH_DARK_TEAL = '#066';
const GRAPH_YELLOW = '#FF0';

/** Module panel drawing. */
export const PANEL = {
	line: '#333', // outlines of controls, jacks and knobs, module lines/paths, dark label text
	symbol: '#222', // bitmap symbols (waveforms, switch icons, spinner arrows)
	sendSymbol: '#646464', // the "send" bitmap
	ink: '#000', // text, jack holes, LED rims
	white: '#FFF', // selected module title, knob highlight, light frames
	highlight: 'white', // underline of the highlighted (keyboard-focused) param
	hover: '#666', // outline of a hovered control
	dragging: '#888', // outline of a knob being dragged
	groupLabel: '#999', // group label bar
	valueBg: '#666', // value display background, unknown-module box
	valueText: '#FFF', // value display text
	mutationLock: '#e00', // frame of a mutation-locked module (Patch Mutator open)
} as const;

/** Module panel background shading (SvgGradientDefs g116-g119). */
export const PANEL_SHADE = {
	dark: 'rgb(16, 16, 16)',
	mid: 'rgb(127, 127, 127)',
	light: 'rgb(190, 190, 190)',
	veryLight: 'rgb(210, 210, 210)',
	white: 'rgb(255, 255, 255)',
} as const;

/** Buttons, switches, mode selectors, spinners. */
export const CONTROL = {
	off: '#CCC',
	on: '#6df2f2',
	single: '#EEE', // single-state button (one label, no on/off)
	disabled: '#e5e5e5',
	selectedRow: '#AAA', // selected row of a mode dropdown
	levelShiftBg: '#A0A0A0', // Output type (Pos/Neg/Bip) switch behind the green half
	arrow: '#555',
	arrowDisabled: '#aaa',
	handle: '#666', // slider handle (not morph-assigned)
	check: '#666', // outline of the check symbol
} as const;

/** Module LEDs (gate/step LEDs). */
export const LED = { on: '#0F0', off: '#040' } as const;

/** Level meters: background and colour zones, bottom/left to top/right, unlit (dim) and lit. */
export const VU_BG = '#111';
export const VU_ZONES = [
	{ from: 0, to: 8 / 16, dim: '#005500', lit: '#00cc00' },
	{ from: 8 / 16, to: 12 / 16, dim: '#555500', lit: '#cccc00' },
	{ from: 12 / 16, to: 1, dim: '#550000', lit: '#cc0000' },
];

/** Module graphs (envelopes, waveforms, filters, DX router) and graph-style displays. */
export const GRAPH_COLORS = {
	bgEnv: GRAPH_TEAL, // background rect for graphenv (envelopes, filters, dx)
	bg: GRAPH_TEAL, // background rect for graph (LFO/OSC waveforms)
	curveStroke: GRAPH_GREEN, // waveform / envelope / filter curve stroke
	areaFill: GRAPH_DARK_TEAL, // area under a curve (envelopes, filter response, comb/noise humps — matches bgEnv → invisible)
	dimLine: GRAPH_GREEN, // dimmed reference lines (filter 0 dB line, Mux8-1X rails, etc.)
	dimLineOpacity: 0.65, // ditto, opacity
	label: GRAPH_YELLOW, // slope value label (yellow text)
	dxLine: GRAPH_GREEN, // dxrouter connection lines
	dxNodeBg: GRAPH_YELLOW, // dxrouter node rect
	dxNodeText: GRAPH_TEAL, // dxrouter node number
} as const;

/** KnobReset centre marker: bright at centre, dark when off-centre. */
export const KNOB_RESET = { centre: GRAPH_GREEN, offCentre: GRAPH_DARK_TEAL, symbol: 'green' } as const;

/** SeqNote piano-roll step strips. */
export const SEQNOTE = { whiteRow: '#ddd', blackRow: '#999', rowLine: '#999' } as const;

/** Morph Group assignment: red = the currently selected group, blue = a different group. */
export const MORPH_COLOR_HEX = {
	red: '#e0303c',
	blue: '#4a63c8',
} as const;
/** Morph range sector on a knob assigned to the selected group (multiplied over the knob). */
export const MORPH_SECTOR = '#Ba4058';

/** Value/assignment hint badges (F5–F8, hover/drag hints), CC# / Parameter Pages drag images: pale yellow. */
export const HINT = { fill: '#FFFFDE', frame: '#000', innerFrame: '#FFF', text: '#000' } as const;

/** Patch canvas overlays. */
export const CANVAS = {
	areaLabel: '#666', // big "Voice" / "FX" label
	dropFill: 'rgba(100,200,100,0.25)', // module drop target
	dropStroke: '#4ade80',
	dragGhost: 'rgba(255,165,0,0.25)', // modules being dragged
	dragGhostStroke: 'orange',
	snapRing: '#000', // jack snap ring while dragging a cable
} as const;

/** Module panel colours by colour id (0-24). */
export const MODULE_COLORS: Record<number, string> = {
	0: '#c0c0c0', // Default gray
	6: '#e5777a',
	13: '#ba7d81',
	14: '#ca8d8d',
	1: '#ccbaba',
	9: '#e7d14b',
	11: '#dec77d',
	15: '#ded1a5',
	4: '#d0cbaa',
	10: '#93d162',
	8: '#82b980',
	16: '#94cf9c',
	2: '#baccba',
	17: '#69d6c7',
	7: '#7bc1bd',
	18: '#a0d2c8',
	19: '#bed2d2',
	5: '#74a0d4',
	20: '#808cc0',
	12: '#8f9ac2',
	3: '#b0bacc',
	21: '#d673c7',
	22: '#be82be',
	23: '#cda0d2',
	24: '#d2bed2',
};

// Per-category accent colors, taken from the original Clavia G2 editor's RegisterCategory calls
// (CModuleFactory::CModuleFactory in G2Editor.c). Keys match ModuleDefinition.page.name.
export const MODULE_CATEGORY_COLORS: Record<string, string> = {
	'In/Out': '#909090',
	Note: '#8c02fd',
	Osc: '#ca0000',
	LFO: '#0000ca',
	Rnd: '#0096e6',
	Env: '#00bbbb',
	Filter: '#008284',
	FX: '#ea64b0',
	Delay: '#8359ff',
	Shaper: '#ce7173',
	Level: '#40a000',
	Mixer: '#ff8040',
	Switch: '#66d9ff',
	Logic: '#f5ea01',
	Seq: '#fecf41',
	MIDI: '#c08000',
	Hidden: '#9e9e9e', // not an original category
};

/** Cable colours with display names, for the colour picker and the cable visibility toggles. */
export const CABLE_COLORS: CableColor[] = [
	{ name: 'red', label: 'Red', hex: '#e74c3c' },
	{ name: 'blue', label: 'Blue', hex: '#3498db' },
	{ name: 'yellow', label: 'Yellow', hex: '#f1c40f' },
	{ name: 'orange', label: 'Orange', hex: '#e67e22' },
	{ name: 'green', label: 'Green', hex: '#2ecc71' },
	{ name: 'purple', label: 'Purple', hex: '#9b59b6' },
	{ name: 'white', label: 'White', hex: '#ecf0f1' },
];

/** Cable stroke colours on the canvas, by cable colour index. */
export const CABLE_SVG_COLORS: Record<number, string> = {
	0: '#f26d6d', // Red
	1: '#6d9cf2', // Blue
	2: '#f2f26d', // Yellow
	3: '#f2a26d', // Orange
	4: '#6df26d', // Green
	5: '#d26df2', // Purple
	6: '#ffffff', // White
};

/** Jack colours for input/output connectors. */
export const JACK_COLORS: Record<string, string> = {
	blue: '#6d6df2',
	red: '#f26d6d',
	yellow: '#f2f26d',
	orange: '#f2f26d', // orange: "#f2a26d",
	green: '#6df26d',
	purple: '#6d6df2', // purple: "#d26df2",
	white: '#e0e0e0',
};
