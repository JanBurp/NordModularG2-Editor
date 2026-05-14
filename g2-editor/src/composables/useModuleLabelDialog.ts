import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';

export function useModuleLabelDialog() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const showLabelDialog = ref(false);
	const editingLabel = ref('');
	const editingModuleId = ref<number | null>(null);

	const showParamLabelDialog = ref(false);
	const editingParamLabel = ref('');
	const editingParamLabelModuleId = ref<number | null>(null);
	const editingParamLabelParamIndex = ref<number | null>(null);

	function handleModuleLabelEdit({ moduleIndex, currentLabel }: { moduleIndex: number; currentLabel: string }): void {
		editingModuleId.value = moduleIndex;
		editingLabel.value = currentLabel;
		showLabelDialog.value = true;
	}

	async function confirmModuleLabel(): Promise<void> {
		if (editingModuleId.value === null) return;
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.setModuleLabel(editingModuleId.value, editingLabel.value, area as 'voice' | 'fx');
		showLabelDialog.value = false;
	}

	function handleParamLabelEdit({ moduleIndex, paramIndex, currentLabel }: { moduleIndex: number; paramIndex: number; currentLabel: string }): void {
		editingParamLabelModuleId.value = moduleIndex;
		editingParamLabelParamIndex.value = paramIndex;
		editingParamLabel.value = currentLabel;
		showParamLabelDialog.value = true;
	}

	async function confirmParamLabel(): Promise<void> {
		if (editingParamLabelModuleId.value === null || editingParamLabelParamIndex.value === null) return;
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.setParamLabel(editingParamLabelModuleId.value, editingParamLabelParamIndex.value, editingParamLabel.value, area);
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
