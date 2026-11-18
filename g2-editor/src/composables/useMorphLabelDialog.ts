import { useSlotsStore } from '@/store/slots';
import { useEditDialog } from './useEditDialog';

// Singleton: the toolbar Morph Groups and the Morph pane open the one dialog rendered by App.vue.
let instance: ReturnType<typeof create> | undefined;
export function useMorphLabelDialog() {
	return (instance ??= create());
}

function create() {
	const slotsStore = useSlotsStore();
	const {
		showDialog: showMorphLabelDialog,
		editingValue: editingMorphLabel,
		open: openWithValue,
		confirm: confirmMorphLabel,
		cancel: cancelMorphLabel,
	} = useEditDialog<string, number>('', 'setMorphGroupLabel', async (label, groupIndex) => {
		if (groupIndex === undefined) return;
		await slotsStore.setMorphGroupLabel(groupIndex, label);
	});

	function openMorphLabelDialog(groupIndex: number, currentLabel: string): void {
		openWithValue(currentLabel, groupIndex);
	}

	return { showMorphLabelDialog, editingMorphLabel, openMorphLabelDialog, confirmMorphLabel, cancelMorphLabel };
}
