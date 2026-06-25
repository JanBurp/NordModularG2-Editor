import type { SlotLabel } from '@/types';
import { SLOT_LABELS } from '@/constants';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import { useBrowserStore } from '@/store/browser';
import { PERF_SETTLE_TIMEOUT_MS } from './usePatchFile';
import type { LogFn } from './useG2';

export function useDeviceEvents(log: LogFn) {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();
	const browserStore = useBrowserStore();

	async function handleEvent(ev: any): Promise<boolean> {
		if (ev.type === 'device_info') {
			store.applyDeviceInfo(ev.data);
			log('←', 'Watch', `device_info name=${ev.data?.synthName ?? '?'}`);
			return true;
		}
		if (ev.type === 'names') {
			if (ev.data) browserStore.applyNamesData(ev.data);
			log('←', 'Watch', 'names');
			return true;
		}
		if (ev.type === 'patch_cleared') {
			browserStore.removePatch(ev.bank, ev.location, ev.kind);
			log('←', 'Watch', `patch_cleared ${ev.kind} ${ev.bank}-${ev.location}`);
			return true;
		}
		if (ev.type === 'patch_names_updated') {
			if (ev.bank !== undefined && ev.location !== undefined && ev.kind && ev.name !== undefined) {
				browserStore.upsertPatch(ev.bank, ev.location, ev.kind, ev.name, ev.category);
				log('←', 'Watch', `patch_names_updated ${ev.kind} ${ev.bank}-${ev.location} "${ev.name}"`);
			} else {
				window.cli.run(['reload-names']).catch(() => {});
				log('←', 'Watch', 'patch_names_updated (fallback reload-names)');
			}
			return true;
		}
		if (ev.type === 'patch_stored') {
			const slotLabels = ['A', 'B', 'C', 'D'] as const;
			const kind = ev.slot === 4 ? 'performance' : 'patch';
			const name =
				ev.slot === 4
					? (store.device?.performance?.name ?? '')
					: (slotsStore.getPatchName(slotLabels[ev.slot as 0 | 1 | 2 | 3]) ?? '');
			browserStore.upsertPatch(ev.bank, ev.location, kind, name);
			log('←', 'Watch', `patch_stored slot=${ev.slot} ${ev.bank}-${ev.location}`);
			return true;
		}
		if (ev.type === 'synth_settings_update') {
			const prevMode = store.device?.mode;
			const prevPerfBank = store.device?.perfBank;
			const prevPerfLoc = store.device?.perfLoc;
			store.updateSynthSettings(ev);
			log('←', 'Watch', `synth mode=${ev.mode} name=${ev.synthName}`);
			if (slotsStore.uploadingFromFile) return true;
			const modeSwitched = !!prevMode && ev.mode !== prevMode;
			// A hardware button press can switch to a different performance while
			// already in Performance mode, so mode itself doesn't change — detect
			// that case via perfBank/perfLoc instead. Skip it if the app itself is
			// already tracking a browser-initiated select (handled separately below).
			const hardwarePerfSwitch =
				!modeSwitched &&
				ev.mode === 'Performance' &&
				prevMode === 'Performance' &&
				store.pendingPerfBank === null &&
				store.pendingPerfLoc === null &&
				(ev.perfBank !== prevPerfBank || ev.perfLoc !== prevPerfLoc);
			if (modeSwitched || hardwarePerfSwitch) store.modeChanging = true;
			if (hardwarePerfSwitch) {
				// Real name/slot state arrives in the paired perf_settings event right
				// after this one; keep the overlay up until then (with a safety timeout
				// in case it never arrives, e.g. disconnect mid-switch).
				setTimeout(() => {
					if (store.modeChanging && store.pendingPerfBank === null) store.modeChanging = false;
				}, PERF_SETTLE_TIMEOUT_MS);
			}
			if (ev.patches && Array.isArray(ev.patches)) {
				// Daemon pre-loaded all slots before rearming (Delphi approach) — apply directly
				const results = await Promise.allSettled(
					ev.patches.filter((p: any) => p?.data).map((p: any) => slotsStore._applyPatchOutput(p.slot as SlotLabel, JSON.stringify(p))),
				);
				results.forEach((r, i) => {
					if (r.status === 'rejected') console.error(`Watch: patch load failed for index ${i}:`, r.reason);
				});
			} else if (modeSwitched) {
				await Promise.all(SLOT_LABELS.map((s) => slotsStore.loadSlot(s)));
			}
			if (store.pendingPerfBank !== null || store.pendingPerfLoc !== null) {
				if (ev.perfBank === store.pendingPerfBank && ev.perfLoc === store.pendingPerfLoc) store.clearPendingPerf();
			} else if (modeSwitched) {
				store.modeChanging = false;
			}
			return true;
		}
		if (ev.type === 'perf_settings') {
			store.updatePerfSettings(ev);
			log('←', 'Watch', `perf_settings ${ev.performance ? 'perf=' + ev.performance.name : ev.patches ? 'patches=' + ev.patches.name : ''}`);
			// Clears the overlay opened for a hardware-initiated performance switch
			// (see synth_settings_update above) once the real name/slot data lands.
			// No-op for the browser-select path (already cleared via perfBank/perfLoc match).
			if (store.modeChanging && store.pendingPerfBank === null && store.pendingPerfLoc === null) store.modeChanging = false;
			return true;
		}
		if (ev.type === 'perf_name') {
			if (store.device?.performance) store.device.performance.name = ev.name;
			log('←', 'Watch', `perf_name: ${ev.name}`);
			return true;
		}
		if (ev.type === 'master_clock_run') {
			if (store.device?.performance) store.device.performance.clockRunning = ev.run === 1;
			log('←', 'Watch', `clock_run=${ev.run}`);
			return true;
		}
		if (ev.type === 'master_clock_bpm') {
			if (store.device?.performance) store.device.performance.bpm = ev.bpm;
			log('←', 'Watch', `clock_bpm=${ev.bpm}`);
			return true;
		}
		if (ev.type === 'assigned_voices') {
			if (Array.isArray(ev.voices)) {
				const slotLabels = ['A', 'B', 'C', 'D'] as const;
				for (let i = 0; i < 4; i++) {
					slotsStore.slots[slotLabels[i]].assignedVoices = ev.voices[i] ?? 0;
					const entry = store.device?.slots.find((s) => s.slot === slotLabels[i]);
					if (entry) entry.active = (ev.voices[i] ?? 0) > 0;
				}
			}
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
		if (ev.type === 'midi_cc') {
			store.lastMidiCC = ev.cc;
			log('←', 'Watch', `midi_cc=${ev.cc}`);
			return true;
		}
		return false;
	}

	return { handleEvent };
}
