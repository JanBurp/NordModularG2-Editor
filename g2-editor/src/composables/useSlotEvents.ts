import { ref } from 'vue';
import { PATCH_PARAM_KEYS } from '@/types/patch';
import type { SlotLabel } from '@/types';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import type { LogFn } from './useG2';

export function useSlotEvents(log: LogFn) {
	const store = useDeviceStore();
	const slotsStore = useSlotsStore();

	const hardwareVariationChange = ref<{ slot: SlotLabel; variation: number } | null>(null);
	const hardwareSlotChange = ref<SlotLabel | null>(null);
	const pendingSlotReload = new Set<SlotLabel>();
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

	async function handleEvent(ev: any): Promise<boolean> {
		if (ev.type === 'slot_data') {
			log('←', 'Watch', `slot_data slot=${ev.slot}`);
			if (ev.data && ev.data.data && !slotsStore.slots[ev.slot as SlotLabel]?.loading) {
				slotsStore._applyPatchOutput(ev.slot as SlotLabel, JSON.stringify(ev.data));
			}
			return true;
		}
		if (ev.type === 'variation_change') {
			const sl = ev.slot as SlotLabel;
			if (sl) hardwareVariationChange.value = { slot: sl, variation: ev.variation as number };
			log('←', 'Watch', `var ${ev.variation + 1} slot=${ev.slot}`);
			return true;
		}
		if (ev.type === 'slot_change') {
			hardwareSlotChange.value = (ev.slot as SlotLabel) ?? null;
			log('←', 'Watch', `slot → ${ev.slot}`);
			return true;
		}
		if (ev.type === 'param_change') {
			log('←', 'Watch', `param s=${ev.slot} area=${ev.area} m=${ev.module} p=${ev.param} v=${ev.value}`, 'param');
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			const patch = slotsStore.slots[slotLabel]?.patch;
			const areaIdx = ev.area === 'va' ? 1 : 0;
			const mod = (patch?.areas?.[areaIdx]?.modules as any[])?.find((m: any) => m.index === ev.module);
			if (mod?.lv && mod.pcnt) {
				const lvIdx = (ev.variation as number) * (mod.pcnt as number) + (ev.param as number);
				if (lvIdx >= 0 && lvIdx < mod.lv.length) mod.lv[lvIdx] = ev.value;
			}
			return true;
		}
		if (ev.type === 'patch_param') {
			log('←', 'Watch', `patch_param s=${ev.slot} p=${ev.param} v=${ev.value} var=${ev.variation}`, 'param');
			const slotLabel = ev.slot as SlotLabel;
			if (!slotLabel || slotsStore.slots[slotLabel]?.loading) return true;
			const params = slotsStore.slots[slotLabel]?.patch?.patchParams;
			const key = PATCH_PARAM_KEYS[ev.param as number];
			if (params?.[ev.variation] && key) {
				(params[ev.variation] as Record<string, number>)[key] = ev.value;
			}
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
				store.updateResources(sl, ev.data);
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

	return { hardwareVariationChange, hardwareSlotChange, fetchSlotResources, handleEvent };
}
