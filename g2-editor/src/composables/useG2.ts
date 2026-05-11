import { computed, ref } from 'vue';

import { Device } from '@/types';
import type { DeviceStatus } from '@/store/device';
import { SLOT_LABELS } from '@/constants';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';

export type { DeviceStatus };

export interface UsbLogEntry {
	id: number;
	timestamp: string;
	direction: '→' | '←' | '•';
	event: string;
	message: string;
	category?: 'param' | 'led' | 'volume' | 'unknown' | 'raw';
}

let logId = 0;

function now(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function useG2() {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();
	const logs = ref<UsbLogEntry[]>([]);
	const hardwareVariationChange = ref<{
		slot: number;
		variation: number;
	} | null>(null);
	const hardwareSlotChange = ref<number | null>(null);
	const isDaemonRunning = ref(false);

	function log(direction: '→' | '←' | '•', event: string, message: string, category?: UsbLogEntry['category']): void {
		const entry: UsbLogEntry = {
			id: ++logId,
			timestamp: now(),
			direction,
			event,
			message,
			category,
		};
		logs.value.push(entry);
		if (category === 'led' || category === 'volume') {
			console.debug(`[USB] ${entry.timestamp} ${entry.direction} ${entry.event} ${entry.message}`);
		} else {
			console.log(`[USB] ${entry.timestamp} ${entry.direction} ${entry.event} ${entry.message}`);
		}
	}

	function clearLogs(): void {
		logs.value = [];
	}

	const deviceStatus = computed<DeviceStatus>(() => store.status);
	const device = computed<Device | null>(() => store.device);

	const statusClass = computed(() => {
		switch (store.status) {
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
				return 'border-neutral-600 bg-neutral-900';
		}
	});

	const statusLabel = computed(() => {
		switch (store.status) {
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
	});

	function formatWatchEvent(ev: any): string {
		switch (ev.type) {
			case 'param_change':
				return `param s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} v=${ev.value}`;
			case 'patch_param':
				return `param s=${ev.slot} p=${ev.param} v=${ev.value}`;
			case 'led_data':
				return `led slot=${ev.slot}`;
			case 'volume_data':
				return `vol slot=${ev.slot}`;
			case 'slot_change':
				return `slot → ${ev.slot}`;
			case 'variation_change':
				return `var ${ev.variation + 1} slot=${SLOT_LABELS[ev.slot] ?? ev.slot}`;
			case 'perf_name':
				return `perf: ${ev.name}`;
			case 'raw_interrupt':
				return `intr: ${ev.hex}`;
			case 'raw_bulk':
				return `bulk[${ev.size}]: ${ev.hex}`;
			default:
				return ev.type ?? '(unknown)';
		}
	}

	const paramWatchTimers = new Map<string, ReturnType<typeof setTimeout>>();

	async function startWatch(): Promise<void> {
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
		let resolveArmed!: () => void;
		const armed = new Promise<void>((r) => { resolveArmed = r; });
		window.cli.onDeviceDisconnected(() => {
			isDaemonRunning.value = false;
			store.status = 'lost';
			log('•', 'Connect', 'Daemon exited unexpectedly');
		});
		window.cli.onWatchDone(() => {
			isDaemonRunning.value = false;
			window.cli.offWatchDone();
		});
		window.cli.onWatchEvent((line: string) => {
			try {
				const ev = JSON.parse(line);
				if (ev.type === 'watch_armed') { resolveArmed(); return; }
				if (ev.type === 'device_disconnected') {
					store.status = 'lost';
					log('•', 'Connect', 'G2 disconnected — cable unplugged?');
					return;
				}
				if (ev.type === 'device_reconnected') {
					store.status = 'connected';
					log('•', 'Connect', 'G2 reconnected');
					return;
				}
				if (ev.type === 'variation_change') {
					hardwareVariationChange.value = {
						slot: ev.slot,
						variation: ev.variation,
					};
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'slot_change') {
					hardwareSlotChange.value = ev.slot;
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'param_change') {
					log('←', 'Watch', formatWatchEvent(ev), 'param');
					const slotLabel = SLOT_LABELS[ev.slot as number];
					if (!slotLabel) return;
					const patch = slotsStore.slots[slotLabel]?.patch;
					const areaIdx = ev.area === 'va' ? 1 : 0;
					const mod = (patch?.areas?.[areaIdx]?.modules as any[])?.find((m: any) => m.index === ev.module);
					if (mod?.lv && mod.pcnt) {
						const lvIdx = (ev.variation as number) * (mod.pcnt as number) + (ev.param as number);
						if (lvIdx >= 0 && lvIdx < mod.lv.length) mod.lv[lvIdx] = ev.value;
					}
					return;
				}
				const category: UsbLogEntry['category'] =
					ev.type === 'param_change' || ev.type === 'patch_param'
						? 'param'
						: ev.type === 'led_data'
							? 'led'
							: ev.type === 'volume_data'
								? 'volume'
								: ev.type === 'raw_interrupt' || ev.type === 'raw_bulk'
									? 'raw'
									: ev.type?.startsWith('unknown')
										? 'unknown'
										: undefined;
				log('←', 'Watch', formatWatchEvent(ev), category);
			} catch {
				log('←', 'Watch', line);
			}
		});
		await window.cli.watchStart();
		await armed;
		isDaemonRunning.value = true;
		log('•', 'Watch', 'Started');
	}

	function stopWatch(): void {
		window.cli.watchStop();
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
	}

	async function connectDevice(): Promise<void> {
		if (typeof window === 'undefined' || !window.cli) {
			store.status = 'unsupported';
			log('•', 'Connect', 'CLI not available');
			return;
		}
		await startWatch();
		log('→', 'Connect', 'Connecting to G2...');
		try {
			await store.connect();
			log('←', 'Connect', `${store.deviceName} (${store.device?.mode})`);
		} catch (e: any) {
			store.status = 'disconnected';
			log('←', 'Connect', `G2 not found: ${e.message}`);
		}
	}

	async function disconnectDevice(): Promise<void> {
		stopWatch();
		log('→', 'Disconnect', 'Disconnecting from G2...');
		try {
			await store.disconnect();
			log('←', 'Disconnect', 'Disconnected from G2');
		} catch (e: any) {
			log('←', 'Disconnect', `Disconnect error: ${e.message}`);
		}
	}

	async function toggleConnection(): Promise<void> {
		if (store.status === 'connected') {
			return await disconnectDevice();
		}
		return await connectDevice();
	}

	async function uploadToG2<T extends Record<string, any>>(patch: T | null): Promise<void> {
		if (!patch) {
			log('•', 'Upload', 'No patch to upload');
			return;
		}
		if (store.status !== 'connected') {
			log('•', 'Upload', 'G2 not connected');
			return;
		}
		log('→', 'Upload', 'Upload not yet implemented');
	}

	async function downloadFromG2(): Promise<void> {
		if (store.status !== 'connected') {
			log('•', 'Download', 'G2 not connected');
			return;
		}
		log('→', 'Download', 'Download not yet implemented');
	}

	return {
		deviceStatus,
		device,
		statusClass,
		statusLabel,
		usbLogs: logs,
		clearLogs,
		connectDevice,
		disconnectDevice,
		toggleConnection,
		startWatch,
		stopWatch,
		uploadToG2,
		downloadFromG2,
		hardwareVariationChange,
		hardwareSlotChange,
		isDaemonRunning,
	};
}
