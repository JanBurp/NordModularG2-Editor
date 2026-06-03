import type { Ref } from 'vue';
import { watch } from 'vue';
import type { SlotLabel } from '@/types';
import { DeviceStatus, useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { SLOT_LABELS } from '@/constants';

export function useSlotManagement(
	hardwareSlotChange: Ref<SlotLabel | null>,
	hardwareVariationChange: Ref<{ slot: SlotLabel; variation: number } | null>,
) {
	const device = useDeviceStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	function applySlotResult(result: { patch: any; name: string } | null): void {
		if (result?.patch?.description?.variation !== undefined) {
			uiStore.variation = result.patch.description.variation;
		}
	}

	async function handleSlotClick(value: string | number | (string | number)[]): Promise<void> {
		const idx = value as number;
		const slot = SLOT_LABELS[idx];

		const slots = device.device?.slots;
		if (slots) {
			const activeCount = slots.filter((s) => s.active).length;
			const target = slots.find((s) => s.slot === slot);

			if (activeCount > 1 && !target?.active) return;

			if (activeCount <= 1) {
				slots.forEach((s) => {
					s.active = s.slot === slot;
					s.key = s.slot === slot;
				});
			} else if (!target?.key) {
				slots.forEach((s) => {
					s.key = s.slot === slot;
				});
			}
		}

		uiStore.setSlotInFocus(slot);
		const patch = slotsStore.slots[slot]?.patch;
		if (patch?.description?.variation !== undefined) uiStore.variation = patch.description.variation;
		if (device.status === DeviceStatus.Connected) applySlotResult(await slotsStore.selectSlot(slot));
	}

	function handleSlotShiftClick(value: string | number): void {
		device.toggleSlotActive(SLOT_LABELS[value as number]);
	}

	function handleSlotCtrlClick(value: string | number): void {
		device.toggleSlotKey(SLOT_LABELS[value as number]);
	}

	async function handleVariationClick(value: string | number | (string | number)[]): Promise<void> {
		const idx = value as number;
		uiStore.variation = idx;
		const patch = slotsStore.slots[uiStore.slotInFocus]?.patch;
		if (patch?.description) patch.description.variation = idx;
		if (device.status === DeviceStatus.Connected) {
			try {
				await slotsStore.selectVariation(idx);
			} catch (e: any) {
				console.error('selectVariation failed:', e?.message ?? e);
			}
		}
	}

	watch(hardwareSlotChange, async (slot) => {
		if (slot === null) return;
		uiStore.setSlotInFocus(slot);
		if (device.status === DeviceStatus.Connected) applySlotResult(await slotsStore.loadSlot(slot));
	});

	watch(hardwareVariationChange, (change) => {
		if (!change) return;
		if (change.slot !== uiStore.slotInFocus) return;
		uiStore.variation = change.variation;
		const activePatch = slotsStore.slots[uiStore.slotInFocus]?.patch;
		if (activePatch?.description) activePatch.description.variation = change.variation;
	});

	return { handleSlotClick, handleSlotShiftClick, handleSlotCtrlClick, handleVariationClick, applySlotResult };
}
