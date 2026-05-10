import type { ModuleInstance } from './module';

export interface Cable {
	colour: number;
	smod: number;
	scon: number;
	dir: number;
	dmod: number;
	dcon: number;
	[key: string]: unknown;
}

export interface Area {
	name: string;
	modules: ModuleInstance[];
	cableList: Cable[];
	paramaterDataOfs: number;
	nummod?: number;
	numcab?: number;
	[key: string]: unknown;
}

export interface PatchDescription {
	voices: number;
	height: number;
	unk2: number;
	red: number;
	blue: number;
	yellow: number;
	orange: number;
	green: number;
	purple: number;
	white: number;
	monopoly: number;
	variation: number;
	category: number;
}

export interface Patch {
	areas: [Area, Area];
	description?: PatchDescription;
	mode?: { area: 0 | 1; variation: number };
}
