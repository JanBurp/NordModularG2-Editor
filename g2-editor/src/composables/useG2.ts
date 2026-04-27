import { computed, ref } from "vue";

import { Device } from "@/types";
import type { DeviceStatus } from "@/store/device";
import { useDeviceStore } from "@/store/device";
import { useSlotsStore } from "@/store/slots";

export type { DeviceStatus };

export interface UsbLogEntry {
	id: number;
	timestamp: string;
	direction: "→" | "←" | "•";
	event: string;
	message: string;
	category?: "param" | "led" | "volume" | "unknown" | "raw";
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

const SLOT_LABELS = ["A", "B", "C", "D"] as const;

export function useG2() {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();
	const logs = ref<UsbLogEntry[]>([]);
	const hardwareVariationChange = ref<{ slot: number; variation: number } | null>(null);
	const hardwareSlotChange = ref<number | null>(null);

	function log(
		direction: "→" | "←" | "•",
		event: string,
		message: string,
		category?: UsbLogEntry["category"],
	): void {
		logs.value.push({ id: ++logId, timestamp: now(), direction, event, message, category });
	}

	function clearLogs(): void {
		logs.value = [];
	}

	const deviceStatus = computed<DeviceStatus>(() => store.status);
	const device = computed<Device|null>(() => store.device);

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
			case "lost":
				return "G2 Disconnected";
			default:
				return "Not Connected";
		}
	});

	function formatWatchEvent(ev: any): string {
		switch (ev.type) {
			case "param_change":      return `param s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} v=${ev.value}`;
			case "patch_param":       return `param s=${ev.slot} p=${ev.param} v=${ev.value}`;
			case "led_data":          return `led slot=${ev.slot}`;
			case "volume_data":       return `vol slot=${ev.slot}`;
			case "slot_change":       return `slot → ${ev.slot}`;
			case "variation_change":  return `var ${ev.variation + 1} slot=${SLOT_LABELS[ev.slot] ?? ev.slot}`;
			case "perf_name":         return `perf: ${ev.name}`;
			case "raw_interrupt":     return `intr: ${ev.hex}`;
			case "raw_bulk":          return `bulk[${ev.size}]: ${ev.hex}`;
			default:                  return ev.type ?? "(unknown)";
		}
	}

	function startWatch(): void {
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.onDeviceDisconnected(() => {
			store.status = "lost";
			log("•", "Connect", "G2 disconnected — cable unplugged?");
		});
		window.cli.onWatchEvent((line: string) => {
			try {
				const ev = JSON.parse(line);
				if (ev.type === "device_disconnected") {
					store.status = "lost";
					log("•", "Connect", "G2 disconnected — cable unplugged?");
					return;
				}
				if (ev.type === "device_reconnected") {
					store.status = "connected";
					log("•", "Connect", "G2 reconnected");
					return;
				}
				if (ev.type === "variation_change") {
					hardwareVariationChange.value = { slot: ev.slot, variation: ev.variation };
					log("←", "Watch", formatWatchEvent(ev));
					return;
				}
				if (ev.type === "slot_change") {
					hardwareSlotChange.value = ev.slot;
					log("←", "Watch", formatWatchEvent(ev));
					return;
				}
				if (ev.type === "param_change") {
					const slotLabel = SLOT_LABELS[ev.slot as number];
					if (slotLabel) {
						const patch = slotsStore.slots[slotLabel]?.patch;
						const areaIdx = ev.area === "va" ? 1 : 0;
						const mod = (patch?.areas?.[areaIdx]?.modules as any[])?.find((m: any) => m.index === ev.module);
						if (mod?.lv && mod.pcnt) {
							const lvIdx = (ev.variation as number) * (mod.pcnt as number) + (ev.param as number);
							if (lvIdx >= 0 && lvIdx < mod.lv.length) mod.lv[lvIdx] = ev.value;
						}
					}
					log("←", "Watch", formatWatchEvent(ev), "param");
					return;
				}
				const category: UsbLogEntry["category"] =
					ev.type === "param_change" || ev.type === "patch_param" ? "param" :
					ev.type === "led_data"     ? "led" :
					ev.type === "volume_data"  ? "volume" :
					ev.type === "raw_interrupt" || ev.type === "raw_bulk"    ? "raw" :
					ev.type?.startsWith("unknown") ? "unknown" : undefined;
				log("←", "Watch", formatWatchEvent(ev), category);
			} catch {
				log("←", "Watch", line);
			}
		});
		window.cli.watchStart();
		log("•", "Watch", "Started");
	}

	function stopWatch(): void {
		window.cli.watchStop();
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
	}

	async function isG2Connected(): Promise<boolean> {
		if (typeof window === "undefined" || !window.cli) {
			return false;
		}
		try {
			const output = await window.cli.run(["list-devices"]);
			return output.includes("Nord G2");
		} catch {
			return false;
		}
	}

	async function connectDevice(): Promise<void> {
		if (typeof window === "undefined" || !window.cli) {
			store.status = "unsupported";
			log("•", "Connect", "CLI not available");
			return;
		}
		log("→", "Connect", "Checking for G2 device...");
		const g2Found = await isG2Connected();
		if (!g2Found) {
			store.status = "disconnected";
			log("←", "Connect", "No G2 device found");
			return;
		}
		log("→", "Connect", "Running startup sequence...");
		try {
			await store.connect();
			log("←", "Connect", `${store.deviceName} (${store.device?.mode})`);
			startWatch();
		} catch (e: any) {
			log("←", "Connect", `Connection failed: ${e.message}`);
		}
	}

	async function disconnectDevice(): Promise<void> {
		stopWatch();
		log("→", "Disconnect", "Disconnecting from G2...");
		try {
			await store.disconnect();
			log("←", "Disconnect", "Disconnected from G2");
		} catch (e: any) {
			log("←", "Disconnect", `Disconnect error: ${e.message}`);
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
		device,
		statusText,
		usbLogs: logs,
		clearLogs,
		connectDevice,
		disconnectDevice,
		startWatch,
		stopWatch,
		uploadToG2,
		downloadFromG2,
		hardwareVariationChange,
		hardwareSlotChange,
	};
}
