import { Device, PatchData, SlotLabel } from '@/types';
import { SLOT_LABELS } from '@/constants';

import { defineStore } from 'pinia';
import { useUiStore } from './ui';

export type DeviceStatus = 'connected' | 'connecting' | 'disconnected' | 'uploading' | 'downloading' | 'error' | 'unsupported' | 'lost' | 'offline';

type ResourceMetrics = { cycles: number; memory: number };
type SlotResources = { va: ResourceMetrics; fx: ResourceMetrics };

function emptySlotResources(): SlotResources {
	return { va: { cycles: 0, memory: 0 }, fx: { cycles: 0, memory: 0 } };
}

// d is the bulk payload. Each block: d[o]=location, d[o+1..o+27]=TPatchLoadData (Delphi indices +1).
// Compound packets pack both areas: block0 at offset 0, 0x72 marker at offset 28, block1 at offset 29.
function parseResourceCycles(d: number[], o: number): number {
	const red1 = d[o + 2] + d[o + 1] * 128;
	const blue1 = d[o + 4] + d[o + 3] * 128;
	return Math.max(100 * red1 / 1372 + 100 * blue1 / 5000, 0);
}

function parseResourceMemory(d: number[], o: number): number {
	const internalMem = d[o + 5];
	const resource4 = d[o + 9] + d[o + 8] * 128;
	const ram = d[o + 22] * 16777216 + d[o + 23] * 65536 + d[o + 24] * 256 + d[o + 25];
	return Math.max(Math.max(100 * internalMem / 128, 100 * ram / 260000), 100 * resource4 / 4315);
}

export const useDeviceStore = defineStore('device', {
	state: () => ({
		status: 'disconnected' as DeviceStatus,
		deviceName: '',
		device: null as Device | null,
		startupNames: null as any,
		slotResources: { A: emptySlotResources(), B: emptySlotResources(), C: emptySlotResources(), D: emptySlotResources() } as Record<SlotLabel, SlotResources>,
		assignedVoices: [0, 0, 0, 0] as number[],
		modeChanging: false,
	}),

	getters: {
		connected: (state) => state.status === 'connected',
		statusClass: (state): string => {
			switch (state.status) {
				case 'connected':
					return 'border-green-500 bg-green-500';
				case 'connecting':
				case 'uploading':
				case 'downloading':
					return 'border-orange-300 bg-orange-300';
				case 'error':
				case 'unsupported':
				case 'lost':
				case 'offline':
					return 'border-red-500 bg-red-500';
				default:
					return 'border-neutral-600 bg-neutral-900 text-neutral-300';
			}
		},
		statusLabel: (state): string => {
			switch (state.status) {
				case 'connected':
					return 'connected';
				case 'connecting':
					return 'connecting...';
				case 'disconnected':
					return 'disconnected';
				case 'uploading':
					return 'uploading...';
				case 'downloading':
					return 'downloading...';
				case 'error':
					return 'error';
				case 'unsupported':
					return 'not available';
				case 'lost':
					return 'lost';
				default:
					return 'unknown';
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
		activeSlotResources: (state): SlotResources => {
			return state.slotResources[useUiStore().slotInFocus];
		},
		assignedVoicesForSlot: (state) => (slot: SlotLabel): number => {
			const idx = ['A', 'B', 'C', 'D'].indexOf(slot);
			return idx >= 0 ? state.assignedVoices[idx] : 0;
		},
	},

	actions: {
		async connect() {
			// Device/slot/names data arrives as startup events in useG2.startWatch()
			this.status = 'connected';
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
				this.status = 'disconnected';
				this.deviceName = '';
				this.device = null;
				this.startupNames = null;
				this.modeChanging = false;
			}
		},

		async togglePerfMode() {
			if (!this.device || this.status !== 'connected') return;
			const newMode = this.device.mode === 'Performance' ? 'patch' : 'performance';
			this.modeChanging = true;
			await window.cli.run(['set-perf-mode', newMode]);
		},

		async setPerfName(name: string): Promise<void> {
			if (this.device?.performance) this.device.performance.name = name;
			if (this.status === 'connected') await window.cli.run(['set-perf-name', name]);
		},

		async setClockRunning(run: boolean): Promise<void> {
			if (this.device?.patches) this.device.patches.clockRunning = run;
			if (this.device?.performance) this.device.performance.clockRunning = run;
			if (this.status === 'connected') await window.cli.run(['set-master-clock-run', run ? '1' : '0']);
		},

		async setBpm(bpm: number): Promise<void> {
			if (this.device?.patches) this.device.patches.bpm = bpm;
			if (this.device?.performance) this.device.performance.bpm = bpm;
			if (this.status === 'connected') await window.cli.run(['set-master-clock-bpm', String(bpm)]);
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
			if (this.status === 'connected') {
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
			if (this.status === 'connected')
				window.cli.run(['set-slot-enabled', slot, entry.active ? '1' : '0']);
		},

		toggleSlotKey(slot: SlotLabel) {
			const entry = this.device?.slots.find((s) => s.slot === slot);
			if (!entry) return;
			entry.key = !entry.key;
			if (this.status === 'connected')
				window.cli.run(['set-slot-key', slot, entry.key ? '1' : '0']);
		},

		updateResources(slot: SlotLabel, data: number[]) {
			const applyBlock = (o: number) => {
				if (data.length < o + 28) return;
				const loc = data[o];
				const metrics = { cycles: parseResourceCycles(data, o), memory: parseResourceMemory(data, o) };
				if (loc === 1) this.slotResources[slot].va = metrics;
				else if (loc === 0) this.slotResources[slot].fx = metrics;
			};
			applyBlock(0);
			// Compound packet: 0x72 sub-command marker at offset 28 → second block at offset 29
			if (data.length >= 57 && data[28] === 0x72) applyBlock(29);
		},
	},
});
