import type { ContextMenuItem, ParamPageAssignment, SlotLabel } from '@/types';
import { useSlotsStore } from '@/store/slots';
import { useKeyHoldOverlay } from './useKeyHoldOverlay';
import { PAGE_LETTERS, BANK_COUNT, KNOBS_PER_PAGE, slotIndexFor, slotIndexToBankPageKnob } from '@/renderer/paramPages';

// Right-click "Assign to Page" submenu on a module parameter — two levels, Page+Bank (A1-E3, 15
// combinations, letter-major) then Knob (1-8). Matches the manual's "Assign|Page|Knob" popup menu
// and useMorphAssign.ts's buildMorphMenuItems shape.
export function buildParamPageMenuItems(opts: {
	slot: SlotLabel | null;
	location: 0 | 1;
	moduleIndex: number;
	paramIndex: number;
	existing: ParamPageAssignment | undefined;
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramIndex, existing } = opts;

	const assignItem: ContextMenuItem = {
		label: 'Assign to Page',
		disabled: !slot,
		children: PAGE_LETTERS.flatMap((letter, page) =>
			Array.from({ length: BANK_COUNT }, (_, bank) => ({
				label: `Page ${letter}${bank + 1}`,
				children: Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => ({
					label: `Knob ${knob + 1}`,
					action: () => slot && slotsStore.assignParamToPage(slot, slotIndexFor(bank, page, knob), location, moduleIndex, paramIndex),
				})),
			})),
		),
	};

	let deassignLabel = 'Deassign';
	if (existing) {
		const { page, knob } = slotIndexToBankPageKnob(existing.slotIndex);
		deassignLabel = `Deassign (Page ${PAGE_LETTERS[page]}, Knob ${knob + 1})`;
	}
	const deassignItem: ContextMenuItem = {
		label: deassignLabel,
		disabled: !existing || !slot,
		action: () => slot && existing && slotsStore.deassignParamPage(slot, existing.slotIndex),
	};

	return [assignItem, deassignItem];
}

// Alt-held state, refcounted via useKeyHoldOverlay's shared registry — gates :draggable on canvas
// params so native HTML5 drag-start (Alt+drag a param onto a Parameter Pages toolbar knob) only
// activates while Alt is physically held, never competing with the existing mousedown-based
// knob-value-drag / Ctrl+drag-morph gestures on the same element.
export function useAltHeld() {
	const { isVisible } = useKeyHoldOverlay('Alt');
	return { altHeld: isVisible };
}
