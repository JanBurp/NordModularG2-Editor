import { computed, ref } from 'vue';
import { SLOT_LABELS } from '@/constants';
import type { SlotLabel } from '@/types';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { showToast } from './useToast';

// Singleton state shared between the menu-action opener and the dialog component
const showDialog = ref(false);

export function useDownloadToSlotDialog() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	function open(): void {
		showDialog.value = true;
	}

	// Clicking a slot button starts the download immediately — no separate confirm step.
	async function selectSlot(target: SlotLabel): Promise<void> {
		showDialog.value = false;
		const ok = await slotsStore.downloadToSynthSlot(uiStore.slotInFocus, target);
		if (ok) showToast(`Downloaded to slot ${target}`);
	}

	function cancel(): void {
		showDialog.value = false;
	}

	const currentSlot = computed(() => uiStore.slotInFocus);
	const slotNames = computed(() => Object.fromEntries(SLOT_LABELS.map((s) => [s, slotsStore.getPatchName(s)])) as Record<SlotLabel, string>);

	return { showDialog, slotOptions: SLOT_LABELS, currentSlot, slotNames, open, selectSlot, cancel };
}
