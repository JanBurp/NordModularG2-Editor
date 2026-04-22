export interface SlotInfo {
	slot: string;
	bank: number;
	patch: number;
	name: string;
	active: boolean;
	key: boolean;
	hold: boolean;
	range: { lower: number; upper: number };
}

export interface Slots {
	A: SlotInfo | null;
	B: SlotInfo | null;
	C: SlotInfo | null;
	D: SlotInfo | null;
}

export interface PatchData {
	name: string;
	focus: string;
	rangeEnable: boolean;
	bpm: number;
	clockRunning: boolean;
	kbSplit: boolean;
}

export interface Settings {
	synthName: string;
	mode: string;
	patches: PatchData | null;
	performance: PatchData | null;
	slots: SlotInfo[];
	midi: {
		slots: { a: number; b: number; c: number; d: number; global: number };
		sysex: number;
		local: boolean;
		prgch: string;
		clkse: boolean;
		clkre: boolean;
	};
	tuning: { semi: number; cent: number };
	pedal: { polarity: boolean; gain: number };
}

export interface DeviceState {
	connected: boolean;
	deviceName: string;
	settings: Settings | null;
}
