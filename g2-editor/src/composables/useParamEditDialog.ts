import { ref, computed } from 'vue';
import { getParam } from '../renderer/parammap';
import type { ParamDefinition } from '../types/index';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';

// Singleton state shared between the keyboard composable (opener) and the dialog component (renderer)
const showDialog = ref(false);
const editingModuleIndex = ref<number | null>(null);
const editingParamIndex = ref<number | null>(null);
const editingParamDef = ref<ParamDefinition | null>(null);
const editingValue = ref(0);
const editingArea = ref<'fx' | 'voice'>('voice');

export function useParamEditDialog() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const isEnumParam = computed(() => {
		const def = editingParamDef.value;
		return !!(def?.names && def.names.length > 0);
	});

	const isMidiNoteParam = computed(() => editingParamDef.value?.f === 'MidiNote');

	function handleParamDblClick(info: { moduleIndex: number; paramIndex: number; paramType: string; currentValue: number; area: 'fx' | 'va' }) {
		const def = getParam(info.paramType) ?? null;
		editingModuleIndex.value = info.moduleIndex;
		editingParamIndex.value = info.paramIndex;
		editingParamDef.value = def;
		editingValue.value = info.currentValue;
		editingArea.value = info.area === 'va' ? 'voice' : 'fx';
		showDialog.value = true;
	}

	async function confirmParamEdit() {
		if (editingModuleIndex.value === null || editingParamIndex.value === null || !editingParamDef.value) return;
		const def = editingParamDef.value;
		const value = Math.max(def.low, Math.min(def.high, editingValue.value));
		await slotsStore.setParam(editingModuleIndex.value, editingParamIndex.value, value, uiStore.variation, editingArea.value);
		showDialog.value = false;
	}

	return {
		showDialog,
		editingParamDef,
		editingValue,
		isEnumParam,
		isMidiNoteParam,
		handleParamDblClick,
		confirmParamEdit,
	};
}
