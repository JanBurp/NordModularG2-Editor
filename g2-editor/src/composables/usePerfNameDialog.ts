import { useDeviceStore } from '@/store/device';
import { useEditDialog } from './useEditDialog';

export function usePerfNameDialog() {
	const device = useDeviceStore();
	const {
		showDialog,
		editingValue: editingName,
		open: openWithValue,
		confirm,
		cancel,
	} = useEditDialog('', 'setPerfName', (name: string) => device.setPerfName(name));

	function open(): void {
		openWithValue(device.perfName);
	}

	return { showDialog, editingName, open, confirm, cancel };
}
