import { ref, computed } from "vue";
import { useDeviceStore } from "@/store/device";
import type { DeviceStatus } from "@/store/device";

export type { DeviceStatus };

export interface UsbLogEntry {
	id: number;
	timestamp: string;
	direction: "→" | "←" | "•";
	event: string;
	message: string;
}

let logId = 0;

function now(): string {
	const d = new Date();
	return (
		[d.getHours(), d.getMinutes(), d.getSeconds()]
			.map((n) => String(n).padStart(2, "0"))
			.join(":") +
		"." +
		String(d.getMilliseconds()).padStart(3, "0")
	);
}

export function useG2() {
	const store = useDeviceStore();
	const logs = ref<UsbLogEntry[]>([]);

	function log(
		direction: "→" | "←" | "•",
		event: string,
		message: string,
	): void {
		logs.value.push({ id: ++logId, timestamp: now(), direction, event, message });
	}

	function clearLogs(): void {
		logs.value = [];
	}

	const deviceStatus = computed<DeviceStatus>(() => store.status);

	const statusText = computed<string>(() => {
		switch (store.status) {
			case "connected":
				return "G2 Connected";
			case "connecting":
				return "Connecting...";
			case "uploading":
				return "Uploading...";
			case "downloading":
				return "Downloading...";
			case "error":
				return "Connection Error";
			case "unsupported":
				return "G2 Not Available";
			default:
				return "Not Connected";
		}
	});

	async function connectDevice(): Promise<void> {
		if (typeof window === "undefined" || !window.cli) {
			store.status = "unsupported";
			log("•", "Connect", "CLI not available");
			return;
		}
		log("→", "Connect", "Connecting to G2...");
		try {
			await store.connect();
			log("←", "Connect", "Connected to G2 successfully");
			log("→", "Device", "Fetching device info...");
			await store.fetchDevice();
			log("←", "Device", `${store.deviceName} (${store.device?.mode})`);
		} catch (e: any) {
			log("←", "Connect", `Connection failed: ${e.message}`);
		}
	}

	async function disconnectDevice(): Promise<void> {
		log("→", "Disconnect", "Disconnecting from G2...");
		try {
			await store.disconnect();
			log("←", "Disconnect", "Disconnected from G2");
		} catch (e: any) {
			log("←", "Disconnect", `Disconnect error: ${e.message}`);
		}
	}

	async function fetchDevice(): Promise<void> {
		log("→", "Device", "Fetching device info...");
		try {
			await store.fetchDevice();
			log("←", "Device", `${store.deviceName} (${store.device?.mode})`);
		} catch (e: any) {
			log("←", "Device", `Failed: ${e.message}`);
		}
	}

	async function uploadToG2<T extends Record<string, any>>(
		patch: T | null,
	): Promise<void> {
		if (!patch) {
			log("•", "Upload", "No patch to upload");
			return;
		}
		if (store.status !== "connected") {
			log("•", "Upload", "G2 not connected");
			return;
		}
		log("→", "Upload", "Upload not yet implemented");
	}

	async function downloadFromG2(): Promise<void> {
		if (store.status !== "connected") {
			log("•", "Download", "G2 not connected");
			return;
		}
		log("→", "Download", "Download not yet implemented");
	}

	return {
		deviceStatus,
		statusText,
		usbLogs: logs,
		clearLogs,
		connectDevice,
		disconnectDevice,
		fetchDevice,
		uploadToG2,
		downloadFromG2,
	};
}
