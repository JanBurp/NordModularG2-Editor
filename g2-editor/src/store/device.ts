import { Device, PerformanceData, SlotLabel } from '@/types';

import { SLOT_LABELS } from '@/constants';
import { defineStore } from 'pinia';

export enum DeviceStatus {
	Connected = 'connected',
	Connecting = 'connecting',
	Loading = 'loading',
	Disconnected = 'disconnected',
	Lost = 'lost',
	Unsupported = 'unsupported',
	Offline = 'offline',
	DriverError = 'driver_error',
}

const STATUS_MAP: Record<DeviceStatus, { textClass: string; dotClass: string; label: string }> = {
	[DeviceStatus.Connected]: { textClass: 'text-green-400', dotClass: 'bg-green-500', label: 'connected' },
	[DeviceStatus.Connecting]: { textClass: 'text-orange-300', dotClass: 'bg-orange-400 animate-pulse', label: 'connecting' },
	[DeviceStatus.Loading]: { textClass: 'text-blue-300', dotClass: 'bg-blue-400 animate-pulse', label: 'loading' },
	[DeviceStatus.Disconnected]: { textClass: 'text-content-secondary', dotClass: 'bg-content-muted', label: 'disconnected' },
	[DeviceStatus.Lost]: { textClass: 'text-red-400', dotClass: 'bg-red-500', label: 'lost' },
	[DeviceStatus.Unsupported]: { textClass: 'text-red-400', dotClass: 'bg-red-500', label: 'not available' },
	[DeviceStatus.Offline]: { textClass: 'text-red-400', dotClass: 'bg-red-500', label: 'offline' },
	[DeviceStatus.DriverError]: { textClass: 'text-red-400', dotClass: 'bg-red-500', label: 'driver error' },
};

export function statusDotClass(status: DeviceStatus): string {
	return STATUS_MAP[status]?.dotClass ?? 'bg-surface-3';
}

export const useDeviceStore = defineStore('device', {
	state: () => ({
		status: DeviceStatus.Disconnected,
		device: null as Device | null,
		modeChanging: false,
		// Re-sending the editor's performance after a reconnect; edits are blocked meanwhile.
		resyncing: false,
		pendingPerfBank: null as number | null,
		pendingPerfLoc: null as number | null,
		lastMidiCC: null as number | null,
		// Slots whose patch no longer matches the bank/patch the device reports (new patch, disk load).
		staleOriginSlots: [] as SlotLabel[],
		// 1-based bank/location a slot's patch (or the performance, key 'perf') was last stored at via Save in Synth.
		storedLocation: {} as Partial<Record<SlotLabel | 'perf', { bank: number; location: number }>>,
	}),

	getters: {
		connected: (state) => state.status === DeviceStatus.Connected,
		statusClass: (state): string => STATUS_MAP[state.status]?.textClass ?? 'text-content-secondary',
		dotClass: (state): string => statusDotClass(state.status),
		statusLabel: (state): string => STATUS_MAP[state.status]?.label ?? 'unknown',
		perfName: (state): string => {
			if (state.device?.mode === 'Performance') return state.device.performance?.name ?? '---';
			return '---';
		},
		// True when the hardware itself is live in Performance mode, regardless of whether a
		// .prf2 was ever loaded from disk in this session (see slotsStore.isPerformanceMode).
		isHardwarePerformanceMode: (state): boolean => state.device?.mode === 'Performance',
		bpm: (state): number => state.device?.performance?.bpm ?? 0,
		clockRunning: (state): boolean => state.device?.performance?.clockRunning ?? false,
		getSlotsActiveStatus: (state): boolean[] => {
			if (!state.device) return [false, false, false, false];
			return SLOT_LABELS.map((s) => state.device?.slots.find((slot) => slot.slot === s)?.active ?? false);
		},
		getSlotsKeyStatus: (state): boolean[] => {
			if (!state.device) return [false, false, false, false];
			return SLOT_LABELS.map((s) => state.device?.slots.find((slot) => slot.slot === s)?.key ?? false);
		},
	},

	actions: {
		applyDeviceInfo(data: Device) {
			this.device = data;
		},

		clearPendingPerf() {
			this.pendingPerfBank = null;
			this.pendingPerfLoc = null;
			this.modeChanging = false;
		},

		async disconnect() {
			try {
				await window.cli.run(['disconnect']);
			} catch {
				// ignore errors on disconnect
			} finally {
				this.status = DeviceStatus.Disconnected;
				this.device = null;
				this.modeChanging = false;
			}
		},

		async togglePerfMode(shift = false) {
			if (!this.device || this.status !== DeviceStatus.Connected) return;
			const newMode = this.device.mode === 'Performance' ? 'patch' : 'performance';
			this.modeChanging = true;
			try {
				await window.cli.run(['set-perf-mode', newMode, ...(shift ? ['shift'] : [])]);
			} catch (e) {
				this.modeChanging = false;
				throw e;
			}
		},

		async setPerfName(name: string): Promise<void> {
			name = name.trim();
			if (this.device?.performance) this.device.performance.name = name;
			if (this.status === DeviceStatus.Connected) await window.cli.run(['set-perf-name', name]);
		},

		async setClockRunning(run: boolean): Promise<void> {
			if (this.device?.performance) this.device.performance.clockRunning = run;
			if (this.status === DeviceStatus.Connected) await window.cli.run(['set-master-clock-run', run ? '1' : '0']);
		},

		async setBpm(bpm: number): Promise<void> {
			if (this.device?.performance) this.device.performance.bpm = bpm;
			if (this.status === DeviceStatus.Connected) await window.cli.run(['set-master-clock-bpm', String(bpm)]);
		},

		async setPerformanceMode(name: string) {
			if (!this.device) {
				this.device = {
					synthName: '',
					mode: 'Performance',
					perfBank: 0,
					perfLoc: 0,
					memProtect: false,
					globalOctaveShiftActive: false,
					globalOctaveShift: 0,
					performance: { name, focus: '', rangeEnable: false, bpm: 0, clockRunning: false },
					slots: [],
					midi: {
						slots: { A: 0, B: 0, C: 0, D: 0, global: 0 },
						sysex: 0,
						local: false,
						prgch: 0,
						ctrlsRecv: false,
						ctrlsSend: false,
						clkse: false,
						clkre: false,
					},
					tuning: { semi: 0, cent: 0 },
					pedal: { polarity: false, gain: 0 },
				};
			} else {
				this.device.mode = 'Performance';
				if (!this.device.performance) {
					this.device.performance = { name, focus: '', rangeEnable: false, bpm: 0, clockRunning: false };
				} else {
					this.device.performance.name = name;
				}
			}
			if (this.status === DeviceStatus.Connected) {
				await window.cli.run(['set-perf-mode', 'performance']);
			}
		},

		updateSynthSettings(ev: {
			synthName: string;
			mode: string;
			perfBank?: number;
			perfLoc?: number;
			memProtect?: boolean;
			globalOctaveShiftActive?: boolean;
			globalOctaveShift?: number;
			midi: Device['midi'];
			tuning: Device['tuning'];
			pedal: Device['pedal'];
		}) {
			if (!this.device) return;
			this.device.synthName = ev.synthName;
			this.device.mode = ev.mode;
			const perfBank = ev.perfBank ?? 0;
			const perfLoc = ev.perfLoc ?? 0;
			// Another performance selected (e.g. on the G2 itself): forget the remembered origin, or Save
			// would overwrite it with this one. The echo of our own select/store keeps it (as updatePerfSettings).
			const stored = this.storedLocation.perf;
			if ((perfBank !== this.device.perfBank || perfLoc !== this.device.perfLoc) && !(stored?.bank === perfBank + 1 && stored.location === perfLoc + 1))
				delete this.storedLocation.perf;
			this.device.perfBank = perfBank;
			this.device.perfLoc = perfLoc;
			this.device.memProtect = ev.memProtect ?? false;
			this.device.globalOctaveShiftActive = ev.globalOctaveShiftActive ?? false;
			this.device.globalOctaveShift = ev.globalOctaveShift ?? 0;
			this.device.midi = ev.midi;
			this.device.tuning = ev.tuning;
			this.device.pedal = ev.pedal;
		},

		updatePerfSettings(ev: { performance?: PerformanceData | null; slots: Device['slots'] }) {
			if (!this.device) return;
			this.device.performance = ev.performance ?? null;
			for (const s of ev.slots) {
				const old = this.device.slots.find((o) => o.slot === s.slot);
				if (!old || (old.bank === s.bank && old.patch === s.patch)) continue;
				const stored = this.storedLocation[s.slot];
				// The echo of our own store reports the stored location; keep the memory then.
				if (stored?.bank === s.bank + 1 && stored.location === s.patch + 1) continue;
				this.clearOriginStale(s.slot);
			}
			this.device.slots = ev.slots;
		},

		setStoredLocation(key: SlotLabel | 'perf', bank: number, location: number) {
			this.storedLocation[key] = { bank, location };
		},

		markOriginStale(slot: SlotLabel) {
			delete this.storedLocation[slot];
			if (!this.staleOriginSlots.includes(slot)) this.staleOriginSlots.push(slot);
		},

		clearOriginStale(slot: SlotLabel) {
			delete this.storedLocation[slot];
			this.staleOriginSlots = this.staleOriginSlots.filter((s) => s !== slot);
		},

		toggleSlotActive(slot: SlotLabel) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.active = !entry.active;
			// Deselecting the keyed slot hands the keyboard to the first slot still selected; the CLI
			// does the same in that one write (reference editor: CPerformance::SetSlotSelection).
			if (!entry.active && entry.key) {
				entry.key = false;
				const next = this.device!.slots.find((s) => s.active);
				if (next) next.key = true;
			}
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-enabled', slot, entry.active ? '1' : '0']).catch((err: unknown) => console.error('set-slot-enabled failed:', err));
		},

		playNote(note: number, on: boolean): Promise<unknown> {
			if (this.status !== DeviceStatus.Connected) return Promise.resolve();
			return window.cli.run(['play-note', String(note), on ? '1' : '0']).catch((err: unknown) => console.error('play-note failed:', err));
		},

		toggleSlotKey(slot: SlotLabel) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.key = !entry.key;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-key', slot, entry.key ? '1' : '0']).catch((err: unknown) => console.error('set-slot-key failed:', err));
		},

		setSlotHold(slot: SlotLabel, value: boolean) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.hold = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-hold', slot, value ? '1' : '0']).catch((err: unknown) => console.error('set-slot-hold failed:', err));
		},

		setSlotRangeLower(slot: SlotLabel, lower: number) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.range.lower = lower;
			if (this.status === DeviceStatus.Connected)
				window.cli
					.run(['set-slot-range', slot, String(lower), String(entry.range.upper)])
					.catch((err: unknown) => console.error('set-slot-range failed:', err));
		},

		setSlotRangeUpper(slot: SlotLabel, upper: number) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.range.upper = upper;
			if (this.status === DeviceStatus.Connected)
				window.cli
					.run(['set-slot-range', slot, String(entry.range.lower), String(upper)])
					.catch((err: unknown) => console.error('set-slot-range failed:', err));
		},

		buildSynthPayload() {
			if (!this.device) return null;
			const d = this.device;
			return {
				synthName: d.synthName,
				mode: d.mode,
				perfBank: d.perfBank,
				perfLoc: d.perfLoc,
				memProtect: d.memProtect,
				globalOctaveShiftActive: d.globalOctaveShiftActive,
				globalOctaveShift: d.globalOctaveShift,
				midi: d.midi,
				tuning: d.tuning,
				pedal: d.pedal,
			};
		},

		sendSynthSettings() {
			const payload = this.buildSynthPayload();
			if (payload && this.status === DeviceStatus.Connected)
				window.cli.run(['set-synth-settings', JSON.stringify(payload)]).catch((err: unknown) => console.error('set-synth-settings failed:', err));
		},

		setSynthName(name: string) {
			if (!this.device) return;
			this.device.synthName = name;
			this.sendSynthSettings();
		},

		setMidiSlot(slot: 'A' | 'B' | 'C' | 'D' | 'global', channel: number) {
			if (!this.device) return;
			this.device.midi.slots[slot] = channel;
			this.sendSynthSettings();
		},

		setMidiSysex(value: number) {
			if (!this.device) return;
			this.device.midi.sysex = value;
			this.sendSynthSettings();
		},

		setMidiLocal(value: boolean) {
			if (!this.device) return;
			this.device.midi.local = value;
			this.sendSynthSettings();
		},

		setMidiPrgCh(value: number) {
			if (!this.device) return;
			this.device.midi.prgch = value;
			this.sendSynthSettings();
		},

		setPerformanceFocus(slot: SlotLabel) {
			if (this.device?.performance) this.device.performance.focus = slot;
		},

		setMidiCtrlsRecv(value: boolean) {
			if (!this.device) return;
			this.device.midi.ctrlsRecv = value;
			this.sendSynthSettings();
		},

		setMidiCtrlsSend(value: boolean) {
			if (!this.device) return;
			this.device.midi.ctrlsSend = value;
			this.sendSynthSettings();
		},

		setMidiClkSend(value: boolean) {
			if (!this.device) return;
			this.device.midi.clkse = value;
			this.sendSynthSettings();
		},

		setMidiClkReceive(value: boolean) {
			if (!this.device) return;
			this.device.midi.clkre = value;
			this.sendSynthSettings();
		},

		setTuningSemi(value: number) {
			if (!this.device) return;
			this.device.tuning.semi = value;
			this.sendSynthSettings();
		},

		setTuningCent(value: number) {
			if (!this.device) return;
			this.device.tuning.cent = value;
			this.sendSynthSettings();
		},

		setMemProtect(value: boolean) {
			if (!this.device) return;
			this.device.memProtect = value;
			this.sendSynthSettings();
		},

		setGlobalOctaveShiftActive(value: boolean) {
			if (!this.device) return;
			this.device.globalOctaveShiftActive = value;
			this.sendSynthSettings();
		},

		setGlobalOctaveShift(value: number) {
			if (!this.device) return;
			this.device.globalOctaveShift = value;
			this.sendSynthSettings();
		},

		setPedalPolarity(value: boolean) {
			if (!this.device) return;
			this.device.pedal.polarity = value;
			this.sendSynthSettings();
		},

		setPedalGain(value: number) {
			if (!this.device) return;
			this.device.pedal.gain = value;
			this.sendSynthSettings();
		},

		setRangeEnable(value: boolean) {
			if (!this.device) return;
			if (this.device.performance) this.device.performance.rangeEnable = value;
			if (this.status === DeviceStatus.Connected) window.cli.run(['set-range-enable', value ? '1' : '0']);
		},

		async sendControllerSnapshot(): Promise<boolean> {
			if (this.status !== DeviceStatus.Connected) return false;
			try {
				// Send all assigned MIDI Controller values to MIDI OUT
				// This will send current CC values for all assigned controllers
				await window.cli.run(['send-controller-snapshot']);
				return true;
			} catch (err) {
				console.error('Failed to send controller snapshot:', err);
				return false;
			}
		},
	},
});
