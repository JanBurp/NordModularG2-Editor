import { ref } from 'vue';
import { useSlotsStore } from '@/store/slots';

export function usePatchNameDialog() {
	const slotsStore = useSlotsStore();
	const showDialog = ref(false);
	const editingName = ref('');

	function open(currentName: string): void {
		editingName.value = currentName;
		showDialog.value = true;
	}

	async function confirm(): Promise<void> {
		try {
			await slotsStore.setPatchName(editingName.value);
		} catch (e: any) {
			console.error('setPatchName failed:', e?.message ?? e);
		} finally {
			showDialog.value = false;
		}
	}

	function cancel(): void {
		showDialog.value = false;
	}

	return { showDialog, editingName, open, confirm, cancel };
}
