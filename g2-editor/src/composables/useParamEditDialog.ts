import { ref, computed } from 'vue';
import { getParam, MidiNote } from '../renderer/parammap';
import type { ParamDefinition } from '../types/index';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';

// Singleton state shared between the keyboard composable (opener) and the dialog component (renderer)
const showDialog = ref(false);
const editingModuleIndex = ref<number | null>(null);
const editingParamIndex = ref<number | null>(null);
const editingParamDef = ref<ParamDefinition | null>(null);
const editingValue = ref(0);
const editingNoteText = ref('');
const editingArea = ref<'fx' | 'voice'>('voice');

function noteNameToMidi(text: string): number | null {
	const trimmed = text.trim();
	if (/^\d+$/.test(trimmed)) return Math.max(0, Math.min(127, parseInt(trimmed, 10)));
	const match = trimmed.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
	if (!match) return null;
	const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	const flatToSharp: Record<string, string> = { Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B' };
	const notePart = match[1].toUpperCase() + match[2];
	const noteIdx = noteNames.indexOf(flatToSharp[notePart] ?? notePart);
	if (noteIdx < 0) return null;
	return Math.max(0, Math.min(127, (parseInt(match[3], 10) + 1) * 12 + noteIdx));
}

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
		if (def?.f === 'MidiNote') {
			editingNoteText.value = MidiNote(info.currentValue);
		}
		showDialog.value = true;
	}

	async function confirmParamEdit() {
		if (editingModuleIndex.value === null || editingParamIndex.value === null || !editingParamDef.value) return;
		const def = editingParamDef.value;
		let value = editingValue.value;
		if (def.f === 'MidiNote') {
			const parsed = noteNameToMidi(editingNoteText.value);
			if (parsed === null) return;
			value = parsed;
		}
		value = Math.max(def.low, Math.min(def.high, value));
		await slotsStore.setParam(editingModuleIndex.value, editingParamIndex.value, value, uiStore.variation, editingArea.value);
		showDialog.value = false;
	}

	return {
		showDialog,
		editingParamDef,
		editingValue,
		editingNoteText,
		isEnumParam,
		isMidiNoteParam,
		handleParamDblClick,
		confirmParamEdit,
	};
}
