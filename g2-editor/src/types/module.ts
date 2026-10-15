import type { PianoRollView } from '../renderer/pianoRoll';

export interface VisualElement {
	type: string;
	x?: number;
	y?: number;
	x1?: number;
	y1?: number;
	x2?: number;
	y2?: number;
	w?: number;
	h?: number;
	d?: string;
	f?: string;
	xo?: number;
	func?: string;
	lv?: number[];
	moduleId?: number;
	ref?: number | number[];
	t?: string;
	anchor?: 'middle' | 'end';
	id?: string | number;
	cnt?: number;
	[key: string]: unknown;
}

export interface ParamLabel {
	paramIndex: number;
	isString: boolean;
	paramLen: number;
	labels: string[];
}

export interface ModuleInstance {
	index: number;
	type: number;
	horiz: number;
	vert: number;
	colour: number;
	uprate: number;
	leds: number;
	pcnt: number;
	lv: number[];
	modes: number[];
	uname?: string;
	paramLabels?: ParamLabel[];
	// SeqNote-only (type 121): the note-editor's Magnifier/Octave-offset view state. See
	// src/renderer/pianoRoll.ts for the shape and default; persisted via the same $PARAM_NAMES
	// wire section as paramLabels (see nmg2PatchParser.ts's parseParamNames).
	pianoRollView?: PianoRollView;
	[key: string]: unknown;
}

export interface ModuleParam {
	name: string;
	type: string;
	n: string;
	x: number;
	y: number;
	w?: number;
	// Overrides the param type's default.
	def?: number;
	// Default text of the original editor's label control (one per button); absent = not renamable.
	label?: string[];
}

export interface ModuleMode {
	name: string;
	type: string;
	x: number;
	y: number;
	w?: number;
	h?: number;
}

export interface ModuleInput {
	name: string;
	colour: string;
	x: number;
	y: number;
}

export interface ModuleOutput {
	name: string;
	colour: string;
	x: number;
	y: number;
}

export interface ModulePage {
	name: string;
	ord: number;
}

export interface ModuleDefinition {
	id: number;
	short: string;
	long: string;
	height: number;
	page?: ModulePage;
	inputs?: ModuleInput[];
	outputs?: ModuleOutput[];
	params?: ModuleParam[];
	// Original editor's order for key navigation/Assign (indices into params); absent = params order.
	paramOrder?: number[];
	// Param indices the original editor's Assign skips (another param links to them).
	assignSkip?: number[];
	modes?: ModuleMode[];
	ve?: VisualElement[];
}

export type JackDragInfo = {
	moduleIndex: number;
	connectorIndex: number;
	type: 'input' | 'output';
	colour: string;
};
