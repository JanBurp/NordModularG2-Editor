import { ref } from 'vue';
import { useDeviceStore } from '@/store/device';

export function useBpmDialog() {
	const device = useDeviceStore();
	const showDialog = ref(false);
	const editingBpm = ref(0);

	function open(): void {
		editingBpm.value = device.bpm;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		try {
			const val = Math.max(30, Math.min(240, editingBpm.value));
			await device.setBpm(val);
		} catch (e: any) {
			console.error('setBpm failed:', e?.message ?? e);
		} finally {
			showDialog.value = false;
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, editingBpm, open, confirm, cancel };
}
