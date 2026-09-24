import { useSlotsStore } from '@/store/slots';
import { useEditDialog } from './useEditDialog';

export function usePatchNameDialog() {
	const slotsStore = useSlotsStore();
	const { showDialog, editingValue: editingName, open, confirm, cancel } = useEditDialog('', 'setPatchName', (name: string) => slotsStore.setPatchName(name));

	return { showDialog, editingName, open, confirm, cancel };
}
