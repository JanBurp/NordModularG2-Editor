import { ref } from 'vue';
import { useDeviceStore } from '@/store/device';

export function usePerfNameDialog() {
	const device = useDeviceStore();
	const showDialog = ref(false);
	const editingName = ref('');

	function open(): void {
		editingName.value = device.perfName;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		try {
			await device.setPerfName(editingName.value);
		} catch (e: any) {
			console.error('setPerfName failed:', e?.message ?? e);
		} finally {
			showDialog.value = false;
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, editingName, open, confirm, cancel };
}
