import type { ModuleInstance } from '@/types';
import { getModule } from '@/renderer/nmg2mods';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { formatParamHint } from '@/utils/moduleControls';

// Official editor (CHintViewList::Idle): hover delay and hide timeout are both 50 ticks of 1/60 s.
export const VALUE_HINT_MS = 833;

type HintTarget = { moduleIndex: number; paramIndex: number; area: 'va' | 'fx' };

// Module-level: one hint for the whole app, like ui.valueHint.
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

// Brief value hint on a param, mirroring the official editor's hint sink: hover shows it after a
// delay and keeps it (pinned) while over the control, a press pins it right away, release or a
// value change shows it for VALUE_HINT_MS, leaving the control removes it.
export function useValueHint() {
	const uiStore = useUiStore();

	function set(target: HintTarget | null, pinned = false) {
		clearTimeout(hoverTimer);
		clearTimeout(hideTimer);
		uiStore.valueHint = target && { ...target, pinned };
		if (target && !pinned) hideTimer = setTimeout(() => (uiStore.valueHint = null), VALUE_HINT_MS);
	}

	function release() {
		const hint = uiStore.valueHint;
		if (hint?.pinned) set(hint);
	}

	return {
		hoverEnter(target: HintTarget) {
			clearTimeout(hoverTimer);
			hoverTimer = setTimeout(() => set(target, true), VALUE_HINT_MS);
		},
		press(target: HintTarget) {
			set(target, true);
			window.addEventListener('mouseup', release, { once: true });
		},
		changed(target: HintTarget) {
			const hint = uiStore.valueHint;
			const same = hint?.moduleIndex === target.moduleIndex && hint.paramIndex === target.paramIndex && hint.area === target.area;
			set(target, same && hint.pinned);
		},
		// While a button is held (dragging), the release timeout takes care of hiding.
		leave(e: MouseEvent) {
			if (e.buttons !== 0) return;
			clearTimeout(hoverTimer);
			if (uiStore.valueHint?.pinned) set(null);
		},
		hide: () => set(null),
	};
}

// Hint text for a param in the focused slot/variation, with its range in the selected morph group.
export function paramHintText(mod: ModuleInstance, paramIndex: number, area: 'va' | 'fx'): string {
	const moduleDef = getModule(mod.type);
	if (!moduleDef) return '';
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const { slotInFocus: slot, variation } = uiStore;
	const values = slotsStore.slots[slot]?.variations?.[variation]?.[area === 'va' ? 'voice' : 'fx']?.[mod.index] ?? [];
	const location = area === 'va' ? 1 : 0;
	const range = slotsStore
		.getMorphAssignments(slot, variation)
		.find(
			(a) => a.location === location && a.groupIndex === uiStore.selectedMorphGroup && a.moduleIndex === mod.index && a.paramIndex === paramIndex,
		)?.range;
	return formatParamHint(moduleDef, paramIndex, values, mod.modes, range);
}
