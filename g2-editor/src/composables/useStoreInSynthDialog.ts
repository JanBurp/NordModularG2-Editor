import { computed, ref } from 'vue';
import { useBrowserStore } from '@/store/browser';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { showToast } from './useToast';

// Singleton state shared between the menu-action opener and the dialog component
const showDialog = ref(false);
const bank = ref(1);
const location = ref(1);
const kind = ref<'patch' | 'performance'>('patch');

export function useStoreInSynthDialog() {
	const browser = useBrowserStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const device = useDeviceStore();

	const maxBank = computed(() => (kind.value === 'performance' ? 8 : 32));
	const maxLocation = computed(() => (kind.value === 'performance' ? 32 : 128));

	function open(): void {
		kind.value = slotsStore.isPerformanceMode || device.isPerformanceMode ? 'performance' : 'patch';
		bank.value = 1;
		location.value = 1;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		showDialog.value = false;
		const name = kind.value === 'performance' ? slotsStore.performanceName : (slotsStore.getPatchName(uiStore.slotInFocus) ?? '(no patch)');
		const slotIdx = Math.min(3, uiStore.selectedSlotIndex) as 0 | 1 | 2 | 3;
		await browser.storePatch(slotIdx, bank.value, location.value, kind.value, name);
		if (kind.value === 'performance' || slotsStore.getPatchForSlot(uiStore.slotInFocus)) {
			showToast(`Saved ${kind.value} at ${bank.value}-${location.value}`);
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, bank, location, kind, maxBank, maxLocation, open, confirm, cancel };
}
