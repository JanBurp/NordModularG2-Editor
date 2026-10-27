import { SLOT_LABELS } from '@/constants';
import { DeviceStatus, useDeviceStore } from '@/store/device';
import type { Device } from '@/types';
import { useSlotsStore } from '@/store/slots';
import { useBrowserStore } from '@/store/browser';
import { useUiStore } from '@/store/ui';
import type { DeviceSummary } from '@/types';

import { ref, watch } from 'vue';
import { bankDownloadProgress } from './useBankDownloadDialog';
import { bankUploadProgress } from './useBankUploadDialog';
import { useDeviceEvents } from './useDeviceEvents';
import { useLedEvents } from './useLedEvents';
import { useSlotEvents } from './useSlotEvents';
import { showToast } from './useToast';

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

export interface NamesLoadProgress {
	location: number;
	total: number;
}
export const namesLoadProgress = ref<NamesLoadProgress | null>(null);

// This device's toolbar group, as shown in its own view and reported to the other device views.
export function deviceSummary(): DeviceSummary {
	const store = useDeviceStore();
	const uiStore = useUiStore();
	return {
		name: store.device?.synthName || null,
		status: store.status,
		perfMode: store.device?.mode === 'Performance',
		selectedSlot: uiStore.selectedSlotIndex,
		slotsActive: store.getSlotsActiveStatus,
		slotsKeyed: store.getSlotsKeyStatus,
	};
}

export function useG2() {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();
	const browserStore = useBrowserStore();
	const isDaemonRunning = ref(false);

	const log: LogFn = (direction, event, message, category) => {
		if (category !== 'led' && category !== 'volume') {
			const fn = event === 'Daemon' || event === 'USB' || event === 'Connect' || event === 'Disconnect' ? console.warn : console.log;
			fn(`[USB] ${now()} ${direction} ${event} ${message}`);
		}
	};

	watch(
		deviceSummary,
		(summary, previous) => {
			if (JSON.stringify(summary) !== JSON.stringify(previous)) window.electronAPI?.devices?.report(summary).catch(() => {});
		},
		{ immediate: true },
	);

	const deviceEvents = useDeviceEvents(log);
	const slotEvents = useSlotEvents(log);
	const ledEvents = useLedEvents(log);

	async function startWatch(): Promise<void> {
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
		namesLoadProgress.value = null;
		let resolveArmed!: () => void;
		let rejectArmed!: (e: Error) => void;
		const armed = new Promise<void>((resolve, reject) => {
			resolveArmed = resolve;
			rejectArmed = reject;
		});
		let activityTimer: ReturnType<typeof setTimeout> | null = null;

		window.cli.onDeviceDisconnected(() => {
			const wasRunning = isDaemonRunning.value;
			isDaemonRunning.value = false;
			if (activityTimer !== null) {
				clearTimeout(activityTimer);
				activityTimer = null;
			}
			if (wasRunning) {
				markLost();
				log('•', 'Connect', 'Daemon exited unexpectedly');
			} else {
				rejectArmed(new Error('Daemon exited'));
			}
		});
		window.cli.onWatchDone(() => {
			const wasRunning = isDaemonRunning.value;
			isDaemonRunning.value = false;
			window.cli.offWatchDone();
			if (activityTimer !== null) {
				clearTimeout(activityTimer);
				activityTimer = null;
			}
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
				activityTimer = setTimeout(() => rejectArmed(new Error('Connection timeout')), 8000);
			}
			try {
				const ev = JSON.parse(line);
				if (ev.type === 'watch_armed') {
					if (activityTimer !== null) {
						clearTimeout(activityTimer);
						activityTimer = null;
					}
					namesLoadProgress.value = null;
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
				if (ev.type === 'device_disconnected') {
					markLost();
					log('•', 'Connect', 'G2 disconnected — cable unplugged?');
					return;
				}
				if (ev.type === 'device_reconnected') {
					store.status = DeviceStatus.Connected;
					log('•', 'Connect', 'G2 reconnected');
					void resyncAfterReconnect();
					return;
				}
				if (ev.type === 'usb_driver_error') {
					store.status = DeviceStatus.DriverError;
					log('←', 'Connect', `USB driver error: ${ev.code ?? 'unknown'}`);
					rejectArmed(new Error('usb_driver_error'));
					return;
				}
				if (ev.type === 'device_info' && store.status === DeviceStatus.Connecting) store.status = DeviceStatus.Loading;
				if (ev.type === 'bank_upload_progress') {
					bankUploadProgress.value = {
						location: ev.location,
						total: ev.total,
						written: ev.written,
						empty: ev.empty,
						corrupt: ev.corrupt,
						name: ev.name ?? '',
					};
					return;
				}
				if (ev.type === 'bank_download_progress') {
					bankDownloadProgress.value = {
						location: ev.location,
						total: ev.total,
						written: ev.written,
						cleared: ev.cleared,
						failed: ev.failed,
						name: ev.name ?? '',
					};
					return;
				}
				if (ev.type === 'names') namesLoadProgress.value = null;
				if (ev.type === 'names_progress') {
					namesLoadProgress.value = { location: ev.location, total: ev.total };
					return;
				}
				if (ledEvents.handleEvent(ev)) return;
				if (await deviceEvents.handleEvent(ev)) return;
				if (await slotEvents.handleEvent(ev)) return;
				// Unrecognised events
				const category: UsbLogEntry['category'] =
					ev.type === 'raw_interrupt' || ev.type === 'raw_bulk' ? 'raw' : ev.type?.startsWith('unknown') ? 'unknown' : undefined;
				log('←', 'Watch', ev.type ?? '(unknown)', category);
			} catch {
				log('←', 'Watch', line);
			}
		});

		await window.cli.watchStart();
		activityTimer = setTimeout(() => rejectArmed(new Error('Connection timeout')), 8000);
		await armed;
		// activityTimer already null'd when watch_armed was handled (or null'd by error paths)
		isDaemonRunning.value = true;
		log('•', 'Daemon', 'Ready');
		// Next to App.vue's version/OS line: the startup queries (device_info, names) are in by now.
		const used = browserStore.flashUsedPercent;
		console.log(
			`[startup] G2 "${store.device?.synthName ?? '?'}" — memory protect ${store.device?.memProtect ? 'on' : 'off'}, flash memory ${used === null ? 'unknown' : `${used.toFixed(1)}% used`}`,
		);
	}

	function stopWatch(): void {
		isDaemonRunning.value = false;
		window.cli.watchStop();
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
	}

	async function connectDevice(opts: { silent?: boolean } = {}): Promise<void> {
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
			if (e.message !== 'usb_driver_error') {
				store.status = DeviceStatus.Disconnected;
				log('←', 'Connect', `G2 not found: ${e.message}`);
				if (!opts.silent) showToast(`G2 not found: ${e.message}`);
			}
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

	// What the editor had when contact was lost; events after the reconnect report the (possibly
	// rebooted) G2's state instead, which must not replace it.
	let lostSnapshot: Pick<Device, 'mode' | 'performance' | 'slots'> | null = null;

	function markLost(): void {
		if (store.status !== DeviceStatus.Lost && store.device)
			lostSnapshot = JSON.parse(JSON.stringify({ mode: store.device.mode, performance: store.device.performance, slots: store.device.slots }));
		store.status = DeviceStatus.Lost;
	}

	// After the daemon reconnected by itself (cable re-plug, G2 power cycle) the editor is the truth, like the official
	// editor (CSynth ctor → CPerformance::ConnectSynth(perf, synth, true) → CleanDirtyData): first force the G2 back
	// into the mode it had, then re-send the whole performance — in Patch mode too. Edits stay blocked meanwhile.
	async function resyncAfterReconnect(): Promise<void> {
		const snap = lostSnapshot;
		lostSnapshot = null;
		store.resyncing = true;
		try {
			log('•', 'Connect', 'Re-sending editor performance after reconnect');
			const ok =
				!!snap?.performance &&
				(await slotsStore._uploadPerformance(
					async () => {
						if (store.device && store.device.mode !== snap.mode)
							await window.cli.run(['set-perf-mode', snap.mode === 'Performance' ? 'performance' : 'patch']);
					},
					snap,
					true,
				));
			// The performance upload leaves the G2 in Perf mode (hardware-observed). Back to Patch with SHIFT, which keeps
			// the uploaded patches in the slots instead of reloading the Patch-mode ones. The mode reported here is
			// current: the upload's rearm (and its synth_settings_update) comes with the first reload's get-patch.
			if (ok && snap.mode !== 'Performance' && store.device?.mode === 'Performance') await window.cli.run(['set-perf-mode', 'patch', 'shift']);
			// No performance to rebuild (e.g. an empty slot): fall back to re-uploading the slots one by one.
			if (!ok) for (const slot of SLOT_LABELS) if (slotsStore.slots[slot]?.patch) await slotsStore.downloadToSynthSlot(slot, slot);
		} catch (err) {
			console.error('Re-sending the performance after reconnect failed:', err);
			showToast('Could not re-send the patches to the G2 after reconnecting — check the G2, then use Download.');
		} finally {
			store.resyncing = false;
		}
	}

	return {
		connectDevice,
		toggleConnection,
		hardwareVariationChange: slotEvents.hardwareVariationChange,
		hardwareSlotChange: slotEvents.hardwareSlotChange,
	};
}
