import { useDeviceStore } from '@/store/device';
import { useEditDialog } from './useEditDialog';

export function useBpmDialog() {
	const device = useDeviceStore();
	const {
		showDialog,
		editingValue: editingBpm,
		open: openWithValue,
		confirm,
		cancel,
	} = useEditDialog(0, 'setBpm', (val: number) => device.setBpm(Math.max(30, Math.min(240, val))));

	function open(): void {
		openWithValue(device.bpm);
	}

	return { showDialog, editingBpm, open, confirm, cancel };
}
