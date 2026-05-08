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
	[key: string]: unknown;
}

export interface ModuleInstance {
	type: number;
	index?: number;
	horiz?: number;
	vert?: number;
	colour?: number;
	uname?: string | null;
	lv?: number[];
	modes?: number[];
}

export interface ModuleParam {
	name: string;
	type: string;
	n: string;
	x: number;
	y: number;
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
	modes?: ModuleMode[];
	ve?: VisualElement[];
}

export type JackDragInfo = {
	moduleIndex: number;
	connectorIndex: number;
	type: 'input' | 'output';
	colour: string;
};
