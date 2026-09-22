import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import type { ModuleDefinition, ModuleInstance } from '../types';
import { DEFAULT_PIANO_ROLL_VIEW, type PianoRollView } from '../renderer/pianoRoll';

// Shared view/dimming state for SeqNote's piano-roll step strips (see SeqNoteStepStrip.vue,
// rendered directly in Module.vue's per-param loop so it inherits morph/CC/param-page assignment
// for free, the same way ModuleSlider does).
export function useSeqNotePianoRoll(moduleDef: ComputedRef<ModuleDefinition | null>, instance: ComputedRef<ModuleInstance>, values: ComputedRef<number[]>) {
	const view = computed<PianoRollView>(() => instance.value.pianoRollView ?? DEFAULT_PIANO_ROLL_VIEW);

	const activeStepCount = computed(() => {
		const lengthIndex = (moduleDef.value?.params ?? []).findIndex((p) => p.name === 'Length');
		if (lengthIndex < 0) return 16;
		return (values.value[lengthIndex] ?? 0) + 1;
	});

	return { view, activeStepCount };
}
