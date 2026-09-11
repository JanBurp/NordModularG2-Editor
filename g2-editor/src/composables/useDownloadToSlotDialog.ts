import { ref } from 'vue';
import { SLOT_LABELS } from '@/constants';
import type { SlotLabel } from '@/types';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { showToast } from './useToast';

// Singleton state shared between the menu-action opener and the dialog component
const showDialog = ref(false);
const targetSlot = ref<SlotLabel>('A');

export function useDownloadToSlotDialog() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	function open(): void {
		targetSlot.value = uiStore.slotInFocus;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		showDialog.value = false;
		const ok = await slotsStore.downloadToSynthSlot(uiStore.slotInFocus, targetSlot.value);
		if (ok) showToast(`Downloaded to slot ${targetSlot.value}`);
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, targetSlot, slotOptions: SLOT_LABELS, open, confirm, cancel };
}
