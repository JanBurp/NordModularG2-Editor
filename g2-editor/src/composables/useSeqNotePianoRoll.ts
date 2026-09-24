import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import type { ModuleInstance } from '../types';
import { DEFAULT_PIANO_ROLL_VIEW, type PianoRollView } from '../renderer/pianoRoll';

// Shared view state for SeqNote's piano-roll step strips (see SeqNoteStepStrip.vue, rendered
// directly in Module.vue's per-param loop so it inherits morph/CC/param-page assignment for free,
// the same way ModuleSlider does).
export function useSeqNotePianoRoll(instance: ComputedRef<ModuleInstance>) {
	const view = computed<PianoRollView>(() => instance.value.pianoRollView ?? DEFAULT_PIANO_ROLL_VIEW);
	return { view };
}
