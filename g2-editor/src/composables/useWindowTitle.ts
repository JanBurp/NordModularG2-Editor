import { watchEffect } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { APP_NAME } from '@/constants';

// Keeps the window/tab title in sync with what's loaded: app name alone when no
// patch is loaded, otherwise "<AppName> -[<PATCH NAME> in Slot <SLOT> (on <PERF NAME>)]"
// (the perf segment only when a .prf2 is loaded), plus " * EDITED" when the active
// slot has unsaved changes.
export function useWindowTitle(): void {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	watchEffect(() => {
		const slot = uiStore.slotInFocus;
		const entry = slotsStore.slots[slot];
		if (!entry?.patch) {
			document.title = APP_NAME;
			return;
		}
		let title = `${APP_NAME} -[${slotsStore.getPatchName(slot)} in Slot ${slot}`;
		if (slotsStore.isPerformanceMode) title += ` (on ${slotsStore.performanceName})`;
		title += ']';
		if (slotsStore.isSlotEdited(slot)) title += ' * EDITED';
		document.title = title;
	});
}
