import { ref } from 'vue';
import { useSlotsStore } from '@/store/slots';

export function useMorphLabelDialog() {
	const slotsStore = useSlotsStore();
	const showMorphLabelDialog = ref(false);
	const editingMorphLabel = ref('');
	const editingMorphGroupIndex = ref<number | null>(null);

	function openMorphLabelDialog(groupIndex: number, currentLabel: string): void {
		editingMorphGroupIndex.value = groupIndex;
		editingMorphLabel.value = currentLabel;
		showMorphLabelDialog.value = true;
	}

	async function confirmMorphLabel(): Promise<void> {
		if (editingMorphGroupIndex.value === null) return;
		try {
			await slotsStore.setMorphGroupLabel(editingMorphGroupIndex.value, editingMorphLabel.value);
		} catch (e: any) {
			console.error('setMorphGroupLabel failed:', e?.message ?? e);
		} finally {
			showMorphLabelDialog.value = false;
		}
	}

	function cancelMorphLabel(): void {
		showMorphLabelDialog.value = false;
	}

	return { showMorphLabelDialog, editingMorphLabel, openMorphLabelDialog, confirmMorphLabel, cancelMorphLabel };
}
