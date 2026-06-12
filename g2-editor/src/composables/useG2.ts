import { ref } from 'vue';

import { DeviceStatus, useDeviceStore } from '@/store/device';
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

function now(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function useG2() {
	const store = useDeviceStore();
	const isDaemonRunning = ref(false);

	const log: LogFn = (direction, event, message, category) => {
		if (category !== 'led' && category !== 'volume') {
			const fn = (event === 'Daemon' || event === 'USB' || event === 'Connect' || event === 'Disconnect') ? console.error : console.log;
			fn(`[USB] ${now()} ${direction} ${event} ${message}`);
		}
	};

	const deviceEvents = useDeviceEvents(log);
	const slotEvents = useSlotEvents(log);
	const ledEvents = useLedEvents(log);

	async function startWatch(): Promise<void> {
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
		let resolveArmed!: () => void;
		let rejectArmed!: (e: Error) => void;
		const armed = new Promise<void>((resolve, reject) => { resolveArmed = resolve; rejectArmed = reject; });
		let activityTimer: ReturnType<typeof setTimeout> | null = null;

		window.cli.onDeviceDisconnected(() => {
			const wasRunning = isDaemonRunning.value;
			isDaemonRunning.value = false;
			if (activityTimer !== null) { clearTimeout(activityTimer); activityTimer = null; }
			if (wasRunning) {
				store.status = DeviceStatus.Lost;
				log('•', 'Connect', 'Daemon exited unexpectedly');
			} else {
				rejectArmed(new Error('Daemon exited'));
			}
		});
		window.cli.onWatchDone(() => {
			const wasRunning = isDaemonRunning.value;
			isDaemonRunning.value = false;
			window.cli.offWatchDone();
			if (activityTimer !== null) { clearTimeout(activityTimer); activityTimer = null; }
			if (wasRunning) {
				store.status = DeviceStatus.Disconnected;
				log('•', 'Daemon', 'Daemon stopped');
			} else {
				rejectArmed(new Error('Daemon finished'));
			}
		});

		window.cli.onWatchEvent(async (line: string) => {
			// Reset inactivity timer on every event — allows startup sequences longer than 2s
			if (activityTimer !== null) {
				clearTimeout(activityTimer);
				activityTimer = setTimeout(() => rejectArmed(new Error('Connection timeout')), 2000);
			}
			try {
				const ev = JSON.parse(line);
				if (ev.type === 'watch_armed') {
					if (activityTimer !== null) { clearTimeout(activityTimer); activityTimer = null; }
					resolveArmed();
					return;
				}
				if (ev.type === 'usb_devices') {
					const all: any[] = ev.data?.all ?? [];
					log('•', 'USB', `${all.length} USB device(s) found`);
					const g2s = all.filter((d: any) => d.isG2);
					if (g2s.length === 0) {
						log('•', 'USB', 'No Nord G2 devices found');
					} else {
						log('•', 'USB', `${g2s.length} Nord G2 device(s): ${g2s.map((d: any) => `bus=${d.bus} dev=${d.device}`).join(', ')}`);
						if (g2s.length > 1 && ev.data?.chosen) log('•', 'USB', `Using first: bus=${ev.data.chosen.bus} device=${ev.data.chosen.device}`);
					}
					return;
				}
				if (ev.type === 'device_disconnected') { store.status = DeviceStatus.Lost; log('•', 'Connect', 'G2 disconnected — cable unplugged?'); return; }
				if (ev.type === 'device_reconnected') { store.status = DeviceStatus.Connected; log('•', 'Connect', 'G2 reconnected'); return; }
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
		activityTimer = setTimeout(() => rejectArmed(new Error('Connection timeout')), 2000);
		await armed;
		// activityTimer already null'd when watch_armed was handled (or null'd by error paths)
		isDaemonRunning.value = true;
		log('•', 'Daemon', 'Ready');
	}

	function stopWatch(): void {
		isDaemonRunning.value = false;
		window.cli.watchStop();
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
	}

	async function connectDevice(): Promise<void> {
		if (typeof window === 'undefined' || !window.cli) {
			store.status = DeviceStatus.Unsupported;
			log('•', 'Connect', 'CLI not available');
			return;
		}
		store.status = DeviceStatus.Connecting;
		log('•', 'Daemon', 'Starting...');
		try {
			await startWatch();
			log('→', 'Connect', 'Connecting to G2...');
			store.status = DeviceStatus.Connected;
			log('←', 'Connect', `${store.device?.synthName ?? ''} (${store.device?.mode})`);
			const activeSlots = store.device?.slots.filter((s) => s.active).map((s) => s.slot) ?? [];
			for (const slot of activeSlots) slotEvents.fetchSlotResources(slot);
		} catch (e: any) {
			store.status = DeviceStatus.Disconnected;
			log('←', 'Connect', `G2 not found: ${e.message}`);
			stopWatch();
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
		if (store.status === DeviceStatus.Connected) return await disconnectDevice();
		return await connectDevice();
	}

	return {
		connectDevice,
		toggleConnection,
		hardwareVariationChange: slotEvents.hardwareVariationChange,
		hardwareSlotChange: slotEvents.hardwareSlotChange,
	};
}
