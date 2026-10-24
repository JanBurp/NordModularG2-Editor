import { computed } from 'vue';
import { useUiStore } from '@/store/ui';
import { useHistoryStore } from '@/store/history';
import { useSlotsStore } from '@/store/slots';
import { useBrowserStore } from '@/store/browser';
import { useOrganizerHistoryStore } from '@/store/organizerHistory';

/* What Undo/Redo (menu ⌘Z / ⇧⌘Z and the toolbar buttons) act on: the Bank Organizer's own
 * history while it is open, otherwise the patch history of the focused slot. */
export function useUndoTarget() {
	const uiStore = useUiStore();
	const historyStore = useHistoryStore();
	const slotsStore = useSlotsStore();
	const browser = useBrowserStore();
	const organizerHistory = useOrganizerHistoryStore();

	const organizer = computed(() => uiStore.showBankOrganizer);
	const canUndo = computed(() => (organizer.value ? organizerHistory.canUndo : historyStore.canUndo(uiStore.slotInFocus)));
	const canRedo = computed(() => (organizer.value ? organizerHistory.canRedo : historyStore.canRedo(uiStore.slotInFocus)));
	const undoTitle = computed(() => (organizer.value && organizerHistory.canUndo ? `Undo ${organizerHistory.undoLabel} (⌘Z)` : 'Undo (⌘Z)'));
	const redoTitle = computed(() => (organizer.value && organizerHistory.canRedo ? `Redo ${organizerHistory.redoLabel} (⇧⌘Z)` : 'Redo (⇧⌘Z)'));

	async function undo(): Promise<void> {
		if (organizer.value) await browser.stepOrganizerHistory('undo');
		else await slotsStore.undo();
	}

	async function redo(): Promise<void> {
		if (organizer.value) await browser.stepOrganizerHistory('redo');
		else await slotsStore.redo();
	}

	return { canUndo, canRedo, undoTitle, redoTitle, undo, redo };
}
