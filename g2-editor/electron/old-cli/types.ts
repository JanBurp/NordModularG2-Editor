export interface Settings {
	slots: {
		A: { variation: number; name: string } | null;
		B: { variation: number; name: string } | null;
		C: { variation: number; name: string } | null;
		D: { variation: number; name: string } | null;
	};
	bank: number;
	program: number;
	masterClock: { tempo: number; running: boolean };
	midiIn: { channel: number; softThru: boolean };
}

export interface DeviceInfo {
	connected: boolean;
	name: string;
}

export type CliResult =
	| { ok: true; data: string }
	| { ok: false; error: string };
