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

export const useDeviceStore = defineStore('device', {
	state: () => ({
		status: DeviceStatus.Disconnected,
		device: null as Device | null,
		modeChanging: false,
	}),

	getters: {
		connected: (state) => state.status === DeviceStatus.Connected,
		statusClass: (state): string => {
			switch (state.status) {
				case DeviceStatus.Connected: return 'text-green-400';
				case DeviceStatus.Connecting: return 'text-orange-300';
				case DeviceStatus.Loading: return 'text-blue-300';
				case DeviceStatus.Unsupported:
				case DeviceStatus.Lost:
				case DeviceStatus.Offline:
				case DeviceStatus.DriverError:
					return 'text-red-400';
				default: return 'text-neutral-400';
			}
		},
		dotClass: (state): string => {
			switch (state.status) {
				case DeviceStatus.Connected: return 'bg-green-500';
				case DeviceStatus.Connecting: return 'bg-orange-400 animate-pulse';
				case DeviceStatus.Loading: return 'bg-blue-400 animate-pulse';
				case DeviceStatus.Unsupported:
				case DeviceStatus.Lost:
				case DeviceStatus.Offline:
				case DeviceStatus.DriverError:
					return 'bg-red-500';
				default: return 'bg-neutral-600';
			}
		},
		statusLabel: (state): string => {
			switch (state.status) {
				case DeviceStatus.Connected: return 'connected';
				case DeviceStatus.Connecting: return 'connecting';
				case DeviceStatus.Loading: return 'loading';
				case DeviceStatus.Disconnected: return 'disconnected';
				case DeviceStatus.Unsupported: return 'not available';
				case DeviceStatus.Lost: return 'lost';
				case DeviceStatus.Offline: return 'offline';
				case DeviceStatus.DriverError: return 'driver error';
				default: return 'unknown';
			}
		},
		perfName: (state): string => {
			if (state.device?.mode === 'Performance') return state.device.performance?.name ?? '---';
			return '---';
		},
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
					synthName: '', mode: 'Performance', perfBank: 0, perfLoc: 0, memProtect: false, globalOctaveShiftActive: false, globalOctaveShift: 0,
					performance: { name, focus: '', rangeEnable: false, bpm: 0, clockRunning: false },
					slots: [],
					midi: { slots: { A: 0, B: 0, C: 0, D: 0, global: 0 }, sysex: 0, local: false, prgch: 0, ctrlsRecv: false, ctrlsSend: false, clkse: false, clkre: false },
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

		updateSynthSettings(ev: { synthName: string; mode: string; perfBank?: number; perfLoc?: number; memProtect?: boolean; globalOctaveShiftActive?: boolean; globalOctaveShift?: number; midi: Device['midi']; tuning: Device['tuning']; pedal: Device['pedal'] }) {
			if (!this.device) return;
			this.device.synthName = ev.synthName;
			this.device.mode = ev.mode;
			this.device.perfBank = ev.perfBank ?? 0;
			this.device.perfLoc  = ev.perfLoc  ?? 0;
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

		buildSynthPayload() {
			const d = this.device!;
			return {
				synthName: d.synthName,
				mode: d.mode,
				perfBank: d.perfBank,
				perfLoc:  d.perfLoc,
				memProtect: d.memProtect,
				globalOctaveShiftActive: d.globalOctaveShiftActive,
				globalOctaveShift: d.globalOctaveShift,
				midi: d.midi,
				tuning: d.tuning,
				pedal: d.pedal,
			};
		},

		sendSynthSettings() {
			if (this.device && this.status === DeviceStatus.Connected)
				window.cli.run(['set-synth-settings', JSON.stringify(this.buildSynthPayload())]);
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
			if (this.status === DeviceStatus.Connected)
				window.cli.run(['set-range-enable', value ? '1' : '0']);
		},

	},
});
