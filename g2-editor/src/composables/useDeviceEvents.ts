import type { SlotLabel } from '@/types';
import { SLOT_LABELS } from '@/constants';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import type { LogFn } from './useG2';

export function useDeviceEvents(log: LogFn) {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();

	async function handleEvent(ev: any): Promise<boolean> {
		if (ev.type === 'device_info') {
			store.applyDeviceInfo(ev.data);
			log('←', 'Watch', `device_info name=${ev.data?.synthName ?? '?'}`);
			return true;
		}
		if (ev.type === 'names') {
			store.startupNames = ev.data ?? null;
			log('←', 'Watch', 'names');
			return true;
		}
		if (ev.type === 'synth_settings_update') {
			const prevMode = store.device?.mode;
			store.updateSynthSettings(ev);
			log('←', 'Watch', `synth mode=${ev.mode} name=${ev.synthName}`);
			if (slotsStore.uploadingFromFile) return true;
			if (prevMode && ev.mode !== prevMode) store.modeChanging = true;
			if (ev.patches && Array.isArray(ev.patches)) {
				// Daemon pre-loaded all slots before rearming (Delphi approach) — apply directly
				await Promise.all(
					ev.patches
						.filter((p: any) => p?.data)
						.map((p: any) => slotsStore._applyPatchOutput(p.slot as SlotLabel, JSON.stringify(p))),
				);
			} else if (prevMode && ev.mode !== prevMode) {
				await Promise.all(SLOT_LABELS.map((s) => slotsStore.loadSlot(s)));
			}
			store.modeChanging = false;
			return true;
		}
		if (ev.type === 'perf_settings') {
			store.updatePerfSettings(ev);
			log('←', 'Watch', `perf_settings ${ev.performance ? 'perf=' + ev.performance.name : ev.patches ? 'patches=' + ev.patches.name : ''}`);
			return true;
		}
		if (ev.type === 'perf_name') {
			if (store.device?.performance) store.device.performance.name = ev.name;
			log('←', 'Watch', `perf_name: ${ev.name}`);
			return true;
		}
		if (ev.type === 'master_clock_run') {
			if (store.device?.patches) store.device.patches.clockRunning = ev.run === 1;
			if (store.device?.performance) store.device.performance.clockRunning = ev.run === 1;
			log('←', 'Watch', `clock_run=${ev.run}`);
			return true;
		}
		if (ev.type === 'master_clock_bpm') {
			if (store.device?.patches) store.device.patches.bpm = ev.bpm;
			if (store.device?.performance) store.device.performance.bpm = ev.bpm;
			log('←', 'Watch', `clock_bpm=${ev.bpm}`);
			return true;
		}
		if (ev.type === 'assigned_voices') {
			if (Array.isArray(ev.voices)) store.assignedVoices = ev.voices;
			log('←', 'Watch', `assigned_voices=[${(ev.voices ?? []).join(',')}]`);
			return true;
		}
		if (ev.type === 'version_update') {
			log('←', 'Watch', `version_update perf=${ev.perf_version} slots=[${(ev.slot_versions ?? []).map((s: any) => s.version).join(',')}]`);
			return true;
		}
		if (ev.type === 'perf_settings_update') {
			log('←', 'Watch', 'perf_settings_update');
			const raw = await window.cli.run(['get-perf-settings']);
			const parsed = JSON.parse(raw);
			store.updatePerfSettings(parsed.data ?? parsed);
			return true;
		}
		return false;
	}

	return { handleEvent };
}
