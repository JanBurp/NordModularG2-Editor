import { computed, ref } from 'vue';
import { useBrowserStore } from '@/store/browser';
import { useDeviceStore } from '@/store/device';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { bankSizeFor, locationSizeFor, defaultBankKind } from '@/constants/ui';
import { slotOrigin, performanceOrigin } from './useSlotOrigin';
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

	const locationNames = computed(() => {
		const list = kind.value === 'performance' ? browser.synthPerformances : browser.synthPatches;
		return new Map(list.filter((p) => p.bank === bank.value).map((p) => [p.location, p.name]));
	});

	const locationLabel = (l: number): string => {
		const name = locationNames.value.get(l);
		return name ? `${l} – ${name}` : `${l}`;
	};

	const storeKey = () => (kind.value === 'performance' ? 'perf' : uiStore.slotInFocus);

	function open(): void {
		kind.value = defaultBankKind(slotsStore.isPerformanceMode, device.isHardwarePerformanceMode);
		const origin = device.storedLocation[storeKey()] ?? (kind.value === 'patch' ? slotOrigin(uiStore.slotInFocus) : performanceOrigin());
		bank.value = origin?.bank ?? 1;
		location.value = origin?.location ?? 1;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		showDialog.value = false;
		const name =
			kind.value === 'performance'
				? (device.device?.performance?.name ?? slotsStore.performanceName)
				: (slotsStore.getPatchName(uiStore.slotInFocus) ?? '(no patch)');
		const slotIdx = Math.min(3, uiStore.selectedSlotIndex) as 0 | 1 | 2 | 3;
		try {
			await browser.storePatch(slotIdx, bank.value, location.value, kind.value, name);
		} catch (err) {
			console.error('Save in synth failed:', err);
			showToast('Failed to save in synth — check device connection.');
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, bank, location, kind, maxBank, maxLocation, locationLabel, open, confirm, cancel };
}
