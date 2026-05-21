import { computed, ref } from 'vue';

import { Device, SlotLabel } from '@/types';
import { PATCH_PARAM_KEYS } from '@/types/patch';
import type { DeviceStatus } from '@/store/device';
import { SLOT_LABELS } from '@/constants';
import { useDeviceStore } from '@/store/device';
import { useLedStore } from '@/store/led';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

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
	const ledStore = useLedStore();
	const uiStore = useUiStore();
	const logs = ref<UsbLogEntry[]>([]);
	const hardwareVariationChange = ref<{
		slot: SlotLabel;
		variation: number;
	} | null>(null);
	const hardwareSlotChange = ref<SlotLabel | null>(null);
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
		if (category !== 'led' && category !== 'volume') {
			console.log(`[USB] ${entry.timestamp} ${entry.direction} ${entry.event} ${entry.message}`);
		}
	}

	function clearLogs(): void {
		logs.value = [];
	}

	const deviceStatus = computed<DeviceStatus>(() => store.status);
	const device = computed<Device | null>(() => store.device);

	function formatWatchEvent(ev: any): string {
		switch (ev.type) {
			case 'device_info':
				return `device_info name=${ev.data?.synthName ?? '?'}`;
			case 'slot_data':
				return `slot_data slot=${ev.slot}`;
			case 'names':
				return 'names';
			case 'param_change':
				return `param s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} v=${ev.value}`;
			case 'patch_param':
				return `patch_param s=${ev.slot} p=${ev.param} v=${ev.value} var=${ev.variation}`;
			case 'led_data':
				return `led slot=${ev.slot}`;
			case 'volume_data':
				return `vol slot=${ev.slot}`;
			case 'slot_change':
				return `slot → ${ev.slot}`;
			case 'variation_change':
				return `var ${ev.variation + 1} slot=${ev.slot}`;
			case 'perf_name':
				return `perf_name: ${ev.name}`;
			case 'patch_name':
				return `patch_name slot=${ev.slot} name=${ev.name}`;
			case 'master_clock_run':
				return `clock_run=${ev.run}`;
			case 'master_clock_bpm':
				return `clock_bpm=${ev.bpm}`;
			case 'version_update':
				return `version_update perf=${ev.perf_version} slots=[${(ev.slot_versions ?? []).map((s: any) => s.version).join(',')}]`;
			case 'synth_settings_update':
				return `synth mode=${ev.mode} name=${ev.synthName}`;
			case 'perf_settings':
				return `perf_settings ${ev.performance ? 'perf=' + ev.performance.name : ev.patches ? 'patches=' + ev.patches.name : ''}`;
			case 'resources_used':
				return `resources slot=${ev.slot} loc=${ev.location ?? (ev.data?.[0] === 1 ? 'va' : 'fx')}`;
			case 'raw_interrupt':
				return `intr: ${ev.hex}`;
			case 'raw_bulk':
				return `bulk[${ev.size}]: ${ev.hex}`;
			default:
				return ev.type ?? '(unknown)';
		}
	}

	const pendingResourceFetch = new Set<SlotLabel>();

	async function fetchSlotResources(slot: SlotLabel): Promise<void> {
		if (store.status !== 'connected') return;
		if (pendingResourceFetch.has(slot)) return;
		pendingResourceFetch.add(slot);
		try {
			const out = await window.cli.run(['get-resources', slot]);
			const parsed = JSON.parse(out) as { bytes: number[] };
			if (Array.isArray(parsed.bytes)) store.updateResources(slot, parsed.bytes);
		} catch {
			// patch may not be loaded in this slot
		} finally {
			pendingResourceFetch.delete(slot);
		}
	}

	async function startWatch(): Promise<void> {
		window.cli.offWatchEvent();
		window.cli.offDeviceDisconnected();
		window.cli.offWatchDone();
		let resolveArmed!: () => void;
		const armed = new Promise<void>((r) => {
			resolveArmed = r;
		});
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
				if (ev.type === 'device_info') {
					store.applyDeviceInfo(ev.data);
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'slot_data') {
					log('←', 'Watch', formatWatchEvent(ev));
					if (ev.data && ev.data.data) {
						slotsStore._applyPatchOutput(ev.slot as SlotLabel, JSON.stringify(ev.data));
					}
					return;
				}
				if (ev.type === 'names') {
					store.startupNames = ev.data ?? null;
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'watch_armed') {
					resolveArmed();
					return;
				}
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
					const sl = ev.slot as SlotLabel;
					if (sl) hardwareVariationChange.value = { slot: sl, variation: ev.variation as number };
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'slot_change') {
					hardwareSlotChange.value = ev.slot as SlotLabel ?? null;
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'param_change') {
					log('←', 'Watch', formatWatchEvent(ev), 'param');
					const slotLabel = ev.slot as SlotLabel;
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
				if (ev.type === 'patch_param') {
					log('←', 'Watch', formatWatchEvent(ev), 'param');
					const slotLabel = ev.slot as SlotLabel;
					if (!slotLabel) return;
					const params = slotsStore.slots[slotLabel]?.patch?.patchParams;
					const key = PATCH_PARAM_KEYS[ev.param as number];
					if (params?.[ev.variation] && key) {
						(params[ev.variation] as Record<string, number>)[key] = ev.value;
					}
					return;
				}
				if (ev.type === 'version_update') {
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'synth_settings_update') {
					const prevMode = store.device?.mode;
					store.updateSynthSettings(ev);
					log('←', 'Watch', formatWatchEvent(ev));
					if (slotsStore.uploadingFromFile) return;
					if (ev.patches && Array.isArray(ev.patches)) {
						// Daemon pre-loaded all slots before rearming (Delphi approach) — apply directly
						for (const p of ev.patches) {
							if (!p || !p.data) continue;
							const slot = p.slot as SlotLabel;
							slotsStore._applyPatchOutput(slot, JSON.stringify(p));
						}
					} else if (prevMode && ev.mode !== prevMode) {
						for (const s of SLOT_LABELS) slotsStore.loadSlot(s);
					}
					return;
				}
				if (ev.type === 'perf_settings') {
					store.updatePerfSettings(ev);
					const focus = (ev.performance?.focus ?? ev.patches?.focus) as SlotLabel | undefined;
					if (focus && SLOT_LABELS.includes(focus)) uiStore.setSlotInFocus(focus);
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'led_data') {
					const slotLabel = ev.slot as SlotLabel;
					if (slotLabel) ledStore.parseLedData(slotLabel, ev.data);
					log('←', 'Watch', formatWatchEvent(ev), 'led');
					return;
				}
				if (ev.type === 'volume_data') {
					const slotLabel = ev.slot as SlotLabel;
					if (slotLabel) ledStore.parseVolumeData(slotLabel, ev.data);
					log('←', 'Watch', formatWatchEvent(ev), 'volume');
					return;
				}
				if (ev.type === 'patch_update') {
					log('←', 'Watch', `patch_update slot=${ev.slot}`);
					const sl = ev.slot as SlotLabel;
					if (sl) fetchSlotResources(sl);
					return;
				}
				if (ev.type === 'resources_used' && Array.isArray(ev.data)) {
					const sl = ev.slot as SlotLabel;
					if (sl) store.updateResources(sl, ev.data);
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'patch_name') {
					const sl = ev.slot as SlotLabel;
					if (sl && slotsStore.slots[sl]) slotsStore.slots[sl].name = ev.name;
					log('←', 'Watch', `patch_name slot=${ev.slot} name=${ev.name}`);
					return;
				}
				if (ev.type === 'perf_name') {
					if (store.device?.performance) store.device.performance.name = ev.name;
					log('←', 'Watch', formatWatchEvent(ev));
					return;
				}
				if (ev.type === 'master_clock_run') {
					if (store.device?.patches) store.device.patches.clockRunning = ev.run === 1;
					if (store.device?.performance) store.device.performance.clockRunning = ev.run === 1;
					log('←', 'Watch', `clock_run=${ev.run}`);
					return;
				}
				if (ev.type === 'master_clock_bpm') {
					if (store.device?.patches) store.device.patches.bpm = ev.bpm;
					if (store.device?.performance) store.device.performance.bpm = ev.bpm;
					log('←', 'Watch', `clock_bpm=${ev.bpm}`);
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
			const activeSlot = store.device?.slots.find((s) => s.active)?.slot ?? null;
			if (activeSlot) fetchSlotResources(activeSlot);
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
