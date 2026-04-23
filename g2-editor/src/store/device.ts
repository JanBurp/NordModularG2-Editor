import { defineStore } from "pinia";
import { Settings } from "@/types";

declare global {
	interface Window {
		cli: {
			run(args: string[]): Promise<string>;
		};
	}
}

export type DeviceStatus =
	| "connected"
	| "connecting"
	| "disconnected"
	| "uploading"
	| "downloading"
	| "error"
	| "unsupported";

export const useDeviceStore = defineStore("device", {
	state: () => ({
		status: "disconnected" as DeviceStatus,
		deviceName: "",
		settings: null as Settings | null,
	}),

	getters: {
		connected: (state) => state.status === "connected",
	},

	actions: {
		async connect() {
			this.status = "connecting";
			try {
				await window.cli.run(["connect"]);
				this.status = "connected";
				this.deviceName = "Nord G2";
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
				this.settings = null;
			}
		},

		async fetchSettings() {
			if (this.status !== "connected") throw new Error("Not connected");
			const output = await window.cli.run(["device"]);
			this.settings = JSON.parse(output);
		},
	},
});
