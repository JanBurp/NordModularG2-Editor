import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';

export function useModuleLabelDialog() {
	const slotsStore = useSlotsStore();

	const showLabelDialog = ref(false);
	const editingLabel = ref('');
	const editingModuleId = ref<number | null>(null);
	const editingArea = ref<'voice' | 'fx'>('voice');

	const showParamLabelDialog = ref(false);
	const editingParamLabel = ref('');
	const editingParamLabelModuleId = ref<number | null>(null);
	const editingParamLabelParamIndex = ref<number | null>(null);
	const editingParamLabelLabelIndex = ref(0);
	const editingParamArea = ref<'voice' | 'fx'>('voice');

	function handleModuleLabelEdit({ moduleIndex, currentLabel, area }: { moduleIndex: number; currentLabel: string; area: 'voice' | 'fx' }): void {
		editingModuleId.value = moduleIndex;
		editingLabel.value = currentLabel;
		editingArea.value = area;
		showLabelDialog.value = true;
	}

	async function confirmModuleLabel(): Promise<void> {
		if (editingModuleId.value === null) return;
		await slotsStore.setModuleLabel(editingModuleId.value, editingLabel.value, editingArea.value);
		showLabelDialog.value = false;
	}

	function handleParamLabelEdit({ moduleIndex, paramIndex, currentLabel, labelIndex = 0, area }: { moduleIndex: number; paramIndex: number; currentLabel: string; labelIndex?: number; area: 'voice' | 'fx' }): void {
		editingParamLabelModuleId.value = moduleIndex;
		editingParamLabelParamIndex.value = paramIndex;
		editingParamLabelLabelIndex.value = labelIndex;
		editingParamLabel.value = currentLabel;
		editingParamArea.value = area;
		showParamLabelDialog.value = true;
	}

	async function confirmParamLabel(): Promise<void> {
		if (editingParamLabelModuleId.value === null || editingParamLabelParamIndex.value === null) return;
		await slotsStore.setParamLabel(editingParamLabelModuleId.value, editingParamLabelParamIndex.value, editingParamLabel.value, editingParamArea.value, editingParamLabelLabelIndex.value);
		showParamLabelDialog.value = false;
	}

	return {
		showLabelDialog,
		editingLabel,
		showParamLabelDialog,
		editingParamLabel,
		handleModuleLabelEdit,
		confirmModuleLabel,
		handleParamLabelEdit,
		confirmParamLabel,
	};
}
