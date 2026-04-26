import { Device } from "@/types";
import { defineStore } from "pinia";

export type DeviceStatus =
	| "connected"
	| "connecting"
	| "disconnected"
	| "uploading"
	| "downloading"
	| "error"
	| "unsupported"
	| "lost";

export const useDeviceStore = defineStore("device", {
	state: () => ({
		status: "disconnected" as DeviceStatus,
		deviceName: "",
		device: null as Device | null,
	}),

	getters: {
		connected: (state) => state.status === "connected",
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
			this.status = "connecting";
			try {
				const output = await window.cli.run(["startup"]);
				const data = JSON.parse(output);
				this.device = data.device as Device;
				this.deviceName = this.device.synthName;
				this.status = "connected";
			} catch (e: any) {
				this.status = "error";
				throw new Error(`Failed to connect: ${e.message}`);
			}
		},

		async disconnect() {
			try {
				await window.cli.run(["disconnect"]);
			} catch {
				// ignore errors on disconnect
			} finally {
				this.status = "disconnected";
				this.deviceName = "";
				this.device = null;
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
