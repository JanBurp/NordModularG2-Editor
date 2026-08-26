import { computed } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';

// Per-variation patch params (patchVol, morphDials, morphModes, ...) for the slot in focus.
export function usePatchParams() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const patchParams = computed(() => slotsStore.getPatchParams(uiStore.slotInFocus));
	return { patchParams };
}
