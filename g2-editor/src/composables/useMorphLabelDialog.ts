import { useSlotsStore } from '@/store/slots';
import { useEditDialog } from './useEditDialog';

export function useMorphLabelDialog() {
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
