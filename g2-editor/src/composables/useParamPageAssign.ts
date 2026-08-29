import type { ContextMenuItem, GlobalParamPageAssignment, ParamPageAssignment, SlotLabel } from '@/types';
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

// Global Parameter Pages sibling of buildParamPageMenuItems above — "Assign to Global Page"
// submenu on a module parameter. Available regardless of ParameterPages.vue's toggle state
// (assigning from canvas doesn't require Global Pages to be the currently *displayed* toolbar
// page). `slot` here is which patch's module is being assigned — becomes the assignment's
// `slot` field, since a Global Page slot can target any of the 4 patches.
export function buildGlobalParamPageMenuItems(opts: {
	slot: SlotLabel | null;
	location: 0 | 1;
	moduleIndex: number;
	paramIndex: number;
	existing: GlobalParamPageAssignment | undefined;
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramIndex, existing } = opts;

	const assignItem: ContextMenuItem = {
		label: 'Assign to Global Page',
		disabled: !slot,
		children: PAGE_LETTERS.flatMap((letter, page) =>
			Array.from({ length: BANK_COUNT }, (_, bank) => ({
				label: `Page ${letter}${bank + 1}`,
				children: Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => ({
					label: `Knob ${knob + 1}`,
					action: () => slot && slotsStore.assignParamToGlobalPage(slot, slotIndexFor(bank, page, knob), location, moduleIndex, paramIndex),
				})),
			})),
		),
	};

	let deassignLabel = 'Deassign Global';
	if (existing) {
		const { page, knob } = slotIndexToBankPageKnob(existing.slotIndex);
		deassignLabel = `Deassign Global (Page ${PAGE_LETTERS[page]}, Knob ${knob + 1})`;
	}
	const deassignItem: ContextMenuItem = {
		label: deassignLabel,
		disabled: !existing,
		action: () => existing && slotsStore.deassignGlobalParamPage(existing.slotIndex),
	};

	return [assignItem, deassignItem];
}

// Module-background right-click "Assign" submenu — bulk-assigns ALL of a module's parameters
// (moduleDef.params, in order) to consecutive Parameter Page knob slots. Matches the manual's
// "Assign|Page X|Multi Column" / "Assign|Page X|Column N" popup menu: Multi Column spreads the
// module across as many pages as it needs starting at that page's first column; Column N confines
// it to that single 8-knob column (both truncate rather than erroring — see assignModuleToPage).
export function buildModuleAssignMenuItems(opts: { slot: SlotLabel | null; location: 0 | 1; moduleIndex: number; paramCount: number }): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramCount } = opts;
	if (paramCount === 0) return [];

	const pageItems: ContextMenuItem[] = PAGE_LETTERS.map((letter, page) => {
		const children: ContextMenuItem[] = [
			{
				label: `Multi Column (${paramCount})`,
				action: () => slot && slotsStore.assignModuleToPage(slot, slotIndexFor(0, page, 0), location, moduleIndex, paramCount),
			},
		];
		for (let bank = 0; bank < BANK_COUNT; bank++) {
			children.push({
				label: `Column ${bank + 1}`,
				action: () =>
					slot && slotsStore.assignModuleToPage(slot, slotIndexFor(bank, page, 0), location, moduleIndex, Math.min(paramCount, KNOBS_PER_PAGE)),
			});
		}
		return { label: `Page ${letter}`, children };
	});

	return [{ label: 'Assign', disabled: !slot, children: pageItems }];
}

// Global Parameter Pages sibling of buildModuleAssignMenuItems above — "Global Assign" submenu on a
// module's background. `slot` is which patch's module is being assigned, same as
// buildGlobalParamPageMenuItems.
export function buildGlobalModuleAssignMenuItems(opts: {
	slot: SlotLabel | null;
	location: 0 | 1;
	moduleIndex: number;
	paramCount: number;
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramCount } = opts;
	if (paramCount === 0) return [];

	const pageItems: ContextMenuItem[] = PAGE_LETTERS.map((letter, page) => {
		const children: ContextMenuItem[] = [
			{
				label: `Multi Column (${paramCount})`,
				action: () => slot && slotsStore.assignModuleToGlobalPage(slot, slotIndexFor(0, page, 0), location, moduleIndex, paramCount),
			},
		];
		for (let bank = 0; bank < BANK_COUNT; bank++) {
			children.push({
				label: `Column ${bank + 1}`,
				action: () =>
					slot && slotsStore.assignModuleToGlobalPage(slot, slotIndexFor(bank, page, 0), location, moduleIndex, Math.min(paramCount, KNOBS_PER_PAGE)),
			});
		}
		return { label: `Page ${letter}`, children };
	});

	return [{ label: 'Global Assign', disabled: !slot, children: pageItems }];
}

// Alt-held state, refcounted via useKeyHoldOverlay's shared registry. Gates the Parameter Pages
// assign-drag affordances so they only arm while Alt is physically held and never compete with the
// mousedown-based knob-value-drag / Ctrl+drag-morph gestures on the same elements: :draggable and
// pointer-events on the toolbar knobs (ParameterPages.vue), and the drag cursors (ParamDragGhost.vue).
export function useAltHeld() {
	const { isVisible } = useKeyHoldOverlay('Alt');
	return { altHeld: isVisible };
}
