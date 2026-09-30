import type { SlotLabel } from '@/types';
import { useBrowserStore } from '@/store/browser';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';

// 1-based bank/location the slot's patch came from, or null when unknown. The device's per-slot
// bank/patch is only updated by retrieve/store, so it is trusted only when the slot isn't marked
// stale, isn't the untouched EmptyPatch, and the patch name matches the synth's entry at that location.
export function slotOrigin(slot: SlotLabel): { bank: number; location: number } | null {
	const device = useDeviceStore();
	const info = device.device?.slots.find((s) => s.slot === slot);
	if (!info || device.staleOriginSlots.includes(slot)) return null;
	const bank = info.bank + 1;
	const location = info.patch + 1;
	const name = useSlotsStore().getPatchName(slot).trim();
	const entry = useBrowserStore().synthPatches.find((p) => p.bank === bank && p.location === location);
	return name && name !== 'EmptyPatch' && entry?.name.trim() === name ? { bank, location } : null;
}
