import type { ContextMenuItem, SlotLabel } from '@/types';
import { useSlotsStore } from '@/store/slots';
import { useKeyHoldOverlay } from './useKeyHoldOverlay';

// Right-click "Morph assign" toggle on a module parameter — assigns/deassigns it to the
// currently-selected Morph Group (see the manual's "ASSIGN PARAMETERS TO A MORPH GROUP" section).
export function buildMorphMenuItems(opts: {
	slot: SlotLabel | null;
	variation: number;
	groupIndex: number;
	location: 0 | 1;
	moduleIndex: number;
	paramIndex: number;
	isAssigned: boolean;
	// Range used when this action *assigns* (ignored when it deassigns) — starts at the full
	// parameter range, matching the real editor; the user then Ctrl-drags a knob/slider to narrow it.
	defaultRange: number;
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, variation, groupIndex, location, moduleIndex, paramIndex, isAssigned, defaultRange } = opts;
	return [
		{
			label: isAssigned ? `Morph assign ✓ (Group ${groupIndex + 1})` : `Morph assign (Group ${groupIndex + 1})`,
			disabled: !slot,
			action: () => {
				if (!slot) return;
				if (isAssigned) slotsStore.deassignParamFromMorphGroup(slot, variation, groupIndex, location, moduleIndex, paramIndex);
				else slotsStore.assignParamToMorphGroup(slot, variation, groupIndex, location, moduleIndex, paramIndex, defaultRange);
			},
		},
	];
}

// Hold-to-show canvas overlays: F6 = morph ranges of assigned params, F7 = which group(s) a
// param is assigned to. Mirrors useMidiCC.ts's useMidiCCOverlay (F8).
export function useMorphRangeOverlay() {
	const { isVisible } = useKeyHoldOverlay('F6');
	return { showMorphRangeOverlay: isVisible };
}

export function useMorphAssignOverlay() {
	const { isVisible } = useKeyHoldOverlay('F7');
	return { showMorphAssignOverlay: isVisible };
}
