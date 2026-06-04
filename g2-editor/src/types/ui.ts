export interface Option {
	label: string;
	value: string | number;
	disabled?: boolean;
}

export interface SlotAreaState {
	areaMode: 0 | 1 | 2; // 0=FX, 1=Voice, 2=Split
	dividerPos: number; // 10–90, percentage from top, default 50
	lastNonSplitArea: 0 | 1; // restored when exiting Split, default 1 (Voice)
}
