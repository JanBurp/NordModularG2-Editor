import { Device, PatchData, SlotLabel } from '@/types';

import { defineStore } from 'pinia';

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
		slotResources: [0, 1, 2, 3].map(() => emptySlotResources()) as SlotResources[],
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
		getActiveSlot: (state): SlotLabel | null => {
			if (!state.device) return null;
			const active = state.device.slots.find((s) => s.active);
			if (!active) return null;
			return active.slot.toUpperCase() as SlotLabel;
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
		getSlotStatus: (state): boolean[] => {
			if (!state.device) return [false, false, false, false];
			return ['a', 'b', 'c', 'd'].map((s) => {
				const slot = state.device?.slots.find((slot) => slot.slot === s);
				return slot?.active ?? false;
			});
		},
		activeSlotResources: (state): SlotResources => {
			if (!state.device) return emptySlotResources();
			const active = state.device.slots.find((s) => s.active);
			if (!active) return emptySlotResources();
			const idx = ['a', 'b', 'c', 'd'].indexOf(active.slot);
			return idx >= 0 ? state.slotResources[idx] : emptySlotResources();
		},
	},

	actions: {
		async connect() {
			this.status = 'connecting';
			let lastErr: Error | null = null;
			for (let attempt = 0; attempt < 3; attempt++) {
				if (attempt > 0) await new Promise((r) => setTimeout(r, 300));
				try {
					const output = await window.cli.run(['startup']);
					const data = JSON.parse(output);
					this.device = data.device as Device;
					this.deviceName = this.device.synthName;
					this.startupNames = data.names ?? null;
					this.status = 'connected';
					return;
				} catch (e: any) {
					lastErr = e;
				}
			}
			this.status = 'error';
			throw new Error(`Failed to connect: ${lastErr?.message}`);
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
			}
		},

		setActiveSlot(slot: string) {
			if (!this.device) return;
			const lower = slot.toLowerCase();
			for (const s of this.device.slots) {
				s.active = s.slot === lower;
			}
		},

		async togglePerfMode() {
			if (!this.device || this.status !== 'connected') return;
			const newMode = this.device.mode === 'Performance' ? 'patch' : 'performance';
			await window.cli.run(['set-perf-mode', newMode]);
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

		updateResources(slot: number, data: number[]) {
			if (slot < 0 || slot > 3) return;
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
