import { computed, ref } from 'vue';

import { Device, SlotLabel } from '@/types';
import type { DeviceStatus } from '@/store/device';
import { useDeviceStore } from '@/store/device';
import { useDeviceEvents } from './useDeviceEvents';
import { useLedEvents } from './useLedEvents';
import { useSlotEvents } from './useSlotEvents';

export type { DeviceStatus };

export interface UsbLogEntry {
	id: number;
	timestamp: string;
	direction: '→' | '←' | '•';
	event: string;
	message: string;
	category?: 'param' | 'led' | 'volume' | 'unknown' | 'raw';
}

export type LogFn = (direction: '→' | '←' | '•', event: string, message: string, category?: UsbLogEntry['category']) => void;

let logId = 0;

function now(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function useG2() {
	const store = useDeviceStore();
	const logs = ref<UsbLogEntry[]>([]);
	const isDaemonRunning = ref(false);

	const log: LogFn = (direction, event, message, category) => {
		const entry: UsbLogEntry = { id: ++logId, timestamp: now(), direction, event, message, category };
		logs.value.push(entry);
		if (category !== 'led' && category !== 'volume') {
			console.log(`[USB] ${entry.timestamp} ${entry.direction} ${entry.event} ${entry.message}`);
		}
	};

	function clearLogs(): void {
		logs.value = [];
	}

	const deviceStatus = computed<DeviceStatus>(() => store.status);
	const device = computed<Device | null>(() => store.device);

	const deviceEvents = useDeviceEvents(log);
	const slotEvents = useSlotEvents(log);
	const ledEvents = useLedEvents(log);

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

		window.cli.onWatchEvent(async (line: string) => {
			try {
				const ev = JSON.parse(line);
				if (ev.type === 'watch_armed') { resolveArmed(); return; }
				if (ev.type === 'device_disconnected') { store.status = 'lost'; log('•', 'Connect', 'G2 disconnected — cable unplugged?'); return; }
				if (ev.type === 'device_reconnected') { store.status = 'connected'; log('•', 'Connect', 'G2 reconnected'); return; }
				if (ledEvents.handleEvent(ev)) return;
				if (await deviceEvents.handleEvent(ev)) return;
				if (await slotEvents.handleEvent(ev)) return;
				// Unrecognised events
				const category: UsbLogEntry['category'] = ev.type === 'raw_interrupt' || ev.type === 'raw_bulk' ? 'raw' : ev.type?.startsWith('unknown') ? 'unknown' : undefined;
				log('←', 'Watch', ev.type ?? '(unknown)', category);
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
		store.status = 'connecting';
		await startWatch();
		log('→', 'Connect', 'Connecting to G2...');
		try {
			await store.connect();
			log('←', 'Connect', `${store.deviceName} (${store.device?.mode})`);
			const activeSlots = store.device?.slots.filter((s) => s.active).map((s) => s.slot) ?? [];
			for (const slot of activeSlots) slotEvents.fetchSlotResources(slot);
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
		if (store.status === 'connected') return await disconnectDevice();
		return await connectDevice();
	}

	async function uploadToG2<T extends Record<string, any>>(patch: T | null): Promise<void> {
		if (!patch) { log('•', 'Upload', 'No patch to upload'); return; }
		if (store.status !== 'connected') { log('•', 'Upload', 'G2 not connected'); return; }
		log('→', 'Upload', 'Upload not yet implemented');
	}

	async function downloadFromG2(): Promise<void> {
		if (store.status !== 'connected') { log('•', 'Download', 'G2 not connected'); return; }
		log('→', 'Download', 'Download not yet implemented');
	}

	return {
		deviceStatus,
		device,
		usbLogs: logs,
		clearLogs,
		connectDevice,
		disconnectDevice,
		toggleConnection,
		startWatch,
		stopWatch,
		uploadToG2,
		downloadFromG2,
		hardwareVariationChange: slotEvents.hardwareVariationChange,
		hardwareSlotChange: slotEvents.hardwareSlotChange,
		isDaemonRunning,
	};
}
