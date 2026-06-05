import { Device, PatchData, SlotLabel } from '@/types';

import { SLOT_LABELS } from '@/constants';
import { defineStore } from 'pinia';

export enum DeviceStatus {
	Connected = 'connected',
	Connecting = 'connecting',
	Disconnected = 'disconnected',
	Lost = 'lost',
	Unsupported = 'unsupported',
	Offline = 'offline',
}

export const useDeviceStore = defineStore('device', {
	state: () => ({
		status: DeviceStatus.Disconnected,
		deviceName: '',
		device: null as Device | null,
		modeChanging: false,
	}),

	getters: {
		connected: (state) => state.status === DeviceStatus.Connected,
		statusClass: (state): string => {
			switch (state.status) {
				case DeviceStatus.Connected: return 'text-green-400';
				case DeviceStatus.Connecting: return 'text-orange-300';
				case DeviceStatus.Unsupported:
				case DeviceStatus.Lost:
				case DeviceStatus.Offline:
					return 'text-red-400';
				default: return 'text-neutral-400';
			}
		},
		dotClass: (state): string => {
			switch (state.status) {
				case DeviceStatus.Connected: return 'bg-green-500';
				case DeviceStatus.Connecting: return 'bg-orange-400 animate-pulse';
				case DeviceStatus.Unsupported:
				case DeviceStatus.Lost:
				case DeviceStatus.Offline:
					return 'bg-red-500';
				default: return 'bg-neutral-600';
			}
		},
		statusLabel: (state): string => {
			switch (state.status) {
				case DeviceStatus.Connected: return 'connected';
				case DeviceStatus.Connecting: return 'connecting';
				case DeviceStatus.Disconnected: return 'disconnected';
				case DeviceStatus.Unsupported: return 'not available';
				case DeviceStatus.Lost: return 'lost';
				case DeviceStatus.Offline: return 'offline';
				default: return 'unknown';
			}
		},
		perfName: (state): string => {
			if (state.device?.performance) return state.device.performance.name;
			return '---';
		},
		bpm: (state): number => {
			if (state.device?.patches) return state.device.patches.bpm;
			if (state.device?.performance) return state.device.performance.bpm;
			return 0;
		},
		clockRunning: (state): boolean => {
			if (state.device?.patches) return state.device.patches.clockRunning;
			if (state.device?.performance) return state.device.performance.clockRunning;
			return false;
		},
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
		async connect() {
			// Device/slot/names data arrives as startup events in useG2.startWatch()
			this.status = DeviceStatus.Connected;
		},

		applyDeviceInfo(data: Device) {
			this.device = data;
			this.deviceName = data.synthName;
		},

		async disconnect() {
			try {
				await window.cli.run(['disconnect']);
			} catch {
				// ignore errors on disconnect
			} finally {
				this.status = DeviceStatus.Disconnected;
				this.deviceName = '';
				this.device = null;
				this.modeChanging = false;
			}
		},

		async togglePerfMode() {
			if (!this.device || this.status !== DeviceStatus.Connected) return;
			const newMode = this.device.mode === 'Performance' ? 'patch' : 'performance';
			this.modeChanging = true;
			try {
				await window.cli.run(['set-perf-mode', newMode]);
			} catch (e) {
				this.modeChanging = false;
				throw e;
			}
		},

		async setPerfName(name: string): Promise<void> {
			if (this.device?.performance) this.device.performance.name = name;
			if (this.status === DeviceStatus.Connected) await window.cli.run(['set-perf-name', name]);
		},

		async setClockRunning(run: boolean): Promise<void> {
			if (this.device?.patches) this.device.patches.clockRunning = run;
			if (this.device?.performance) this.device.performance.clockRunning = run;
			if (this.status === DeviceStatus.Connected) await window.cli.run(['set-master-clock-run', run ? '1' : '0']);
		},

		async setBpm(bpm: number): Promise<void> {
			if (this.device?.patches) this.device.patches.bpm = bpm;
			if (this.device?.performance) this.device.performance.bpm = bpm;
			if (this.status === DeviceStatus.Connected) await window.cli.run(['set-master-clock-bpm', String(bpm)]);
		},

		async setPerformanceMode(name: string) {
			if (!this.device) {
				this.device = {
					synthName: '', mode: 'Performance', patches: null,
					performance: { name, focus: '', rangeEnable: false, bpm: 0, clockRunning: false, kbSplit: false },
					slots: [],
					midi: { slots: { A: 0, B: 0, C: 0, D: 0, global: 0 }, sysex: 0, local: false, prgch: '', clkse: false, clkre: false },
					tuning: { semi: 0, cent: 0 },
					pedal: { polarity: false, gain: 0 },
				};
			} else {
				this.device.mode = 'Performance';
				if (!this.device.performance) {
					this.device.performance = { name, focus: '', rangeEnable: false, bpm: 0, clockRunning: false, kbSplit: false };
				} else {
					this.device.performance.name = name;
				}
			}
			if (this.status === DeviceStatus.Connected) {
				await window.cli.run(['set-perf-mode', 'performance']);
			}
		},

		updateSynthSettings(ev: { synthName: string; mode: string; midi: Device['midi']; tuning: Device['tuning']; pedal: Device['pedal'] }) {
			if (!this.device) return;
			this.device.synthName = ev.synthName;
			this.device.mode = ev.mode;
			this.device.midi = ev.midi;
			this.device.tuning = ev.tuning;
			this.device.pedal = ev.pedal;
			this.deviceName = ev.synthName;
		},

		updatePerfSettings(ev: { performance?: PatchData | null; patches?: PatchData | null; slots: Device['slots'] }) {
			if (!this.device) return;
			this.device.performance = ev.performance ?? null;
			this.device.patches = ev.patches ?? null;
			this.device.slots = ev.slots;
		},

		toggleSlotActive(slot: SlotLabel) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.active = !entry.active;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-enabled', slot, entry.active ? '1' : '0']);
		},

		toggleSlotKey(slot: SlotLabel) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.key = !entry.key;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-key', slot, entry.key ? '1' : '0']);
		},

		setSlotHold(slot: SlotLabel, value: boolean) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.hold = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-hold', slot, value ? '1' : '0']);
		},

		setSlotRangeLower(slot: SlotLabel, lower: number) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.range.lower = lower;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-range', slot, String(lower), String(entry.range.upper)]);
		},

		setSlotRangeUpper(slot: SlotLabel, upper: number) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.range.upper = upper;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-slot-range', slot, String(entry.range.lower), String(upper)]);
		},

		setSynthName(name: string) {
			if (!this.device) return;
			this.device.synthName = name;
			this.deviceName = name;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-synth-name', name]);
		},

		setMidiSlot(slot: 'A' | 'B' | 'C' | 'D' | 'global', channel: number) {
			if (!this.device) return;
			this.device.midi.slots[slot] = channel;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-midi-channel', slot, String(channel)]);
		},

		setMidiSysex(value: number) {
			if (!this.device) return;
			this.device.midi.sysex = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-midi-sysex', String(value)]);
		},

		setMidiLocal(value: boolean) {
			if (!this.device) return;
			this.device.midi.local = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-midi-local', value ? '1' : '0']);
		},

		setMidiPrgCh(value: string) {
			if (!this.device) return;
			this.device.midi.prgch = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-midi-prgch', value]);
		},

		setMidiClkSend(value: boolean) {
			if (!this.device) return;
			this.device.midi.clkse = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-midi-clkse', value ? '1' : '0']);
		},

		setMidiClkReceive(value: boolean) {
			if (!this.device) return;
			this.device.midi.clkre = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-midi-clkre', value ? '1' : '0']);
		},

		setTuningSemi(value: number) {
			if (!this.device) return;
			this.device.tuning.semi = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-tuning', String(value), String(this.device.tuning.cent)]);
		},

		setTuningCent(value: number) {
			if (!this.device) return;
			this.device.tuning.cent = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-tuning', String(this.device.tuning.semi), String(value)]);
		},

		setPedalPolarity(value: boolean) {
			if (!this.device) return;
			this.device.pedal.polarity = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-pedal-polarity', value ? '1' : '0']);
		},

		setPedalGain(value: number) {
			if (!this.device) return;
			this.device.pedal.gain = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-pedal-gain', String(value)]);
		},

		setRangeEnable(value: boolean) {
			if (!this.device) return;
			if (this.device.performance) this.device.performance.rangeEnable = value;
			if (this.device.patches) this.device.patches.rangeEnable = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-range-enable', value ? '1' : '0']);
		},

		setKbSplit(value: boolean) {
			if (!this.device) return;
			if (this.device.performance) this.device.performance.kbSplit = value;
			if (this.device.patches) this.device.patches.kbSplit = value;
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-kb-split', value ? '1' : '0']);
		},

	},
});
