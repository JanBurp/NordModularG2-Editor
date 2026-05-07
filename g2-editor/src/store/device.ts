import { Device, SlotLabel } from '@/types';

import { defineStore } from 'pinia';

export type DeviceStatus = 'connected' | 'connecting' | 'disconnected' | 'uploading' | 'downloading' | 'error' | 'unsupported' | 'lost';

export const useDeviceStore = defineStore('device', {
	state: () => ({
		status: 'disconnected' as DeviceStatus,
		deviceName: '',
		device: null as Device | null,
		startupNames: null as any,
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
	},

	actions: {
		async connect() {
			this.status = 'connecting';
			try {
				const output = await window.cli.run(['startup']);
				const data = JSON.parse(output);
				this.device = data.device as Device;
				this.deviceName = this.device.synthName;
				this.startupNames = data.names ?? null;
				this.status = 'connected';
			} catch (e: any) {
				this.status = 'error';
				throw new Error(`Failed to connect: ${e.message}`);
			}
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
	},
});
