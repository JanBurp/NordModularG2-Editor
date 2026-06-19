import { DeviceStatus, useDeviceStore } from '@/store/device';

import type { LogFn } from './useG2';
import { PATCH_PARAM_KEYS } from '@/types/patch';
import type { SlotLabel } from '@/types';
import { ref } from 'vue';
import { useSlotsStore } from '@/store/slots';

export function useSlotEvents(log: LogFn) {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();

	const hardwareVariationChange = ref<{ slot: SlotLabel; variation: number } | null>(null);
	const hardwareSlotChange = ref<SlotLabel | null>(null);
	const pendingSlotReload = new Set<SlotLabel>();
	const pendingResourceFetch = new Set<SlotLabel>();
	let keyFocusTimer: ReturnType<typeof setTimeout> | null = null;

	/* The G2 doesn't reliably emit a watch event after a software slot switch
	 * (it depends on whether the target slot was already active), so we can't
	 * key off a specific event without risking a stale/misfired command later.
	 * A short debounced delay gives the device time to settle instead. */
	function requestKeyFocus(slot: SlotLabel, previouslyKeyed: SlotLabel[]): void {
		if (keyFocusTimer) clearTimeout(keyFocusTimer);
		keyFocusTimer = setTimeout(async () => {
			keyFocusTimer = null;
			if (store.status !== DeviceStatus.Connected) return;
			try {
				for (const sl of previouslyKeyed) await window.cli.run(['set-slot-key', sl, '0']);
				await window.cli.run(['set-slot-key', slot, '1']);
			} catch { /* device may have disconnected mid-debounce; state resyncs on next event */ }
		}, 100);
	}

	async function fetchSlotResources(slot: SlotLabel): Promise<void> {
		if (store.status !== DeviceStatus.Connected) return;
		if (pendingResourceFetch.has(slot)) return;
		pendingResourceFetch.add(slot);
		try {
			const out = await window.cli.run(['get-resources', slot]);
			const parsed = JSON.parse(out);
			if (Array.isArray(parsed)) slotsStore.updateResources(slot, parsed);
		} catch {
			// patch may not be loaded in this slot
		} finally {
			pendingResourceFetch.delete(slot);
		}
	}

	async function handleEvent(ev: any): Promise<boolean> {
		if (ev.type === 'slot_data') {
			log('←', 'Watch', `slot_data slot=${ev.slot}`);
			if (ev.data && ev.data.data && !slotsStore.slots[ev.slot as SlotLabel]?.loading) {
				slotsStore._applyPatchOutput(ev.slot as SlotLabel, JSON.stringify(ev.data));
			}
			return true;
		}
		if (ev.type === 'copy_variation') {
			slotsStore.handleCopyVariationEvent(ev.slot as SlotLabel, ev.from as number, ev.to as number);
			log('←', 'Watch', `copy_variation slot=${ev.slot} from=${ev.from} to=${ev.to}`);
			return true;
		}
		if (ev.type === 'variation_change') {
			const sl = ev.slot as SlotLabel;
			if (sl) hardwareVariationChange.value = { slot: sl, variation: ev.variation as number };
			log('←', 'Watch', `var ${ev.variation + 1} slot=${ev.slot}`);
			return true;
		}
		if (ev.type === 'slot_change') {
			const sl = ev.slot as SlotLabel;
			hardwareSlotChange.value = sl ?? null;
			log('←', 'Watch', `slot → ${ev.slot}`);
			// Refresh actual slot state (key, active) from G2 — slot_change alone
			// doesn't carry full info since multiple slots can hold key=true.
			if (sl && store.status === DeviceStatus.Connected) {
				try {
					const raw = await window.cli.run(['get-perf-settings']);
					const parsed = JSON.parse(raw);
					store.updatePerfSettings(parsed.data ?? parsed);
				} catch { /* state will sync on next perf_settings event */ }
			}
			return true;
		}
		if (ev.type === 'param_change') {
			log('←', 'Watch', `param s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} v=${ev.value}`, 'param');
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			const areaKey = ev.area === 'va' ? 'voice' : 'fx';
			const vState = slotsStore.slots[slotLabel]?.variations?.[ev.variation as number];
			if (vState?.[areaKey]?.[ev.module as number]) vState[areaKey][ev.module as number][ev.param as number] = ev.value;
			return true;
		}
		if (ev.type === 'patch_param') {
			log('←', 'Watch', `patch_param s=${ev.slot} m=${ev.module} p=${ev.param} v=${ev.value} var=${ev.variation}`, 'param');
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			if (ev.module === 1) {
				// Section 1 = morphs: params 0–7 are dials, 8–15 are modes
				const vState = slotsStore.slots[slotLabel]?.variations?.[ev.variation as number];
				if (vState) {
					if ((ev.param as number) < 8) vState.patch.morphDials[ev.param as number] = ev.value as number;
					else vState.patch.morphModes[(ev.param as number) - 8] = ev.value as number;
				}
				return true;
			}
			// Hardware sends section-local param indices; ev.module holds the section ID (2–7).
			// Section offsets map to global PATCH_PARAM_KEYS indices.
			const SECTION_OFFSETS: Record<number, number> = { 2: 0, 3: 2, 4: 4, 5: 6, 6: 9, 7: 13 };
			const globalIdx = (SECTION_OFFSETS[ev.module as number] ?? 0) + (ev.param as number);
			const key = PATCH_PARAM_KEYS[globalIdx];
			const vState = slotsStore.slots[slotLabel]?.variations?.[ev.variation as number];
			if (vState && key) (vState.patch as unknown as Record<string, number>)[key] = ev.value;
			return true;
		}
		if (ev.type === 'patch_name') {
			const sl = ev.slot as SlotLabel;
			if (sl && slotsStore.slots[sl]) slotsStore.slots[sl].name = ev.name;
			log('←', 'Watch', `patch_name slot=${ev.slot} name=${ev.name}`);
			return true;
		}
		if (ev.type === 'patch_version_change') {
			log('←', 'Watch', `patch_version_change slot=${ev.slot} ver=${ev.version}`);
			const sl = ev.slot as SlotLabel;
			if (sl) pendingSlotReload.add(sl);
			return true;
		}
		if (ev.type === 'patch_update') {
			log('←', 'Watch', `patch_update slot=${ev.slot}`);
			const sl = ev.slot as SlotLabel;
			if (sl) fetchSlotResources(sl);
			return true;
		}
		if (ev.type === 'resources_used' && Array.isArray(ev.data)) {
			const sl = ev.slot as SlotLabel;
			if (sl) {
				slotsStore.updateResources(sl, ev.data);
				if (pendingSlotReload.has(sl)) {
					pendingSlotReload.delete(sl);
					slotsStore.loadSlot(sl);
				}
			}
			log('←', 'Watch', `resources slot=${ev.slot} loc=${ev.location ?? (ev.data?.[0] === 1 ? 'va' : 'fx')}`);
			return true;
		}
		return false;
	}

	return { hardwareVariationChange, hardwareSlotChange, fetchSlotResources, requestKeyFocus, handleEvent };
}
