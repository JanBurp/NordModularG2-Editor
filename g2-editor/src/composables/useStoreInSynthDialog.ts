import { computed, ref } from 'vue';
import { useBrowserStore } from '@/store/browser';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { bankSizeFor, locationSizeFor, defaultBankKind } from '@/constants/ui';
import { slotOrigin } from './useSlotOrigin';
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

	const maxBank = computed(() => bankSizeFor(kind.value));
	const maxLocation = computed(() => locationSizeFor(kind.value));

	function open(): void {
		kind.value = defaultBankKind(slotsStore.isPerformanceMode, device.isHardwarePerformanceMode);
		const origin = kind.value === 'patch' ? slotOrigin(uiStore.slotInFocus) : null;
		bank.value = origin?.bank ?? 1;
		location.value = origin?.location ?? 1;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		showDialog.value = false;
		const name = kind.value === 'performance' ? slotsStore.performanceName : (slotsStore.getPatchName(uiStore.slotInFocus) ?? '(no patch)');
		const slotIdx = Math.min(3, uiStore.selectedSlotIndex) as 0 | 1 | 2 | 3;
		try {
			await browser.storePatch(slotIdx, bank.value, location.value, kind.value, name);
			if (kind.value === 'performance' || slotsStore.getPatchForSlot(uiStore.slotInFocus)) {
				showToast(`Saved ${kind.value} at ${bank.value}-${location.value}`);
			}
		} catch (err) {
			console.error('Save in synth failed:', err);
			showToast('Failed to save in synth — check device connection.');
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, bank, location, kind, maxBank, maxLocation, open, confirm, cancel };
}
