import type { ContextMenuItem, GlobalParamPageAssignment, ParamPageAssignment, SlotLabel } from '@/types';
import { useSlotsStore } from '@/store/slots';
import { useKeyHoldOverlay } from './useKeyHoldOverlay';
import { PAGE_LETTERS, BANK_COUNT, KNOBS_PER_PAGE, slotIndexFor, slotIndexToBankPageKnob } from '@/renderer/paramPages';

// Shared by buildParamPageMenuItems/buildGlobalParamPageMenuItems below — both build the same
// "Assign to Page" (Page+Bank then Knob) submenu plus a "Deassign" item, differing only in the
// assign/deassign store calls and the label text.
function buildParamPageMenuItemsImpl(
	slot: SlotLabel | null,
	existing: { slotIndex: number } | undefined,
	config: {
		assignLabel: string;
		deassignPrefix: string;
		deassignDisabled: boolean;
		assign: (slotIndex: number) => void;
		deassign: () => void;
	},
): ContextMenuItem[] {
	const assignItem: ContextMenuItem = {
		label: config.assignLabel,
		disabled: !slot,
		children: PAGE_LETTERS.flatMap((letter, page) =>
			Array.from({ length: BANK_COUNT }, (_, bank) => ({
				label: `Page ${letter}${bank + 1}`,
				children: Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => ({
					label: `Knob ${knob + 1}`,
					action: () => config.assign(slotIndexFor(bank, page, knob)),
				})),
			})),
		),
	};

	let deassignLabel = config.deassignPrefix;
	if (existing) {
		const { page, knob } = slotIndexToBankPageKnob(existing.slotIndex);
		deassignLabel = `${config.deassignPrefix} (Page ${PAGE_LETTERS[page]}, Knob ${knob + 1})`;
	}
	const deassignItem: ContextMenuItem = {
		label: deassignLabel,
		disabled: config.deassignDisabled,
		action: config.deassign,
	};

	return [assignItem, deassignItem];
}

// Right-click "Assign to Page" submenu on a module parameter — two levels, Page+Bank (A1-E3, 15
// combinations, letter-major) then Knob (1-8). Matches the manual's "Assign|Page|Knob" popup menu
// and useMorphAssign.ts's buildMorphMenuItems shape.
export function buildParamPageMenuItems(opts: {
	slot: SlotLabel | null;
	location: 0 | 1 | 2; // 2 = Morph Group (PATCH_MORPH module 1, paramIndex = group)
	moduleIndex: number;
	paramIndex: number; // LED number when isLed
	existing: ParamPageAssignment | undefined;
	isLed?: 0 | 1; // 1 = level meter target, see ParamPageAssignment.isLed
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramIndex, existing, isLed = 0 } = opts;

	return buildParamPageMenuItemsImpl(slot, existing, {
		assignLabel: 'Assign to Page',
		deassignPrefix: 'Deassign',
		deassignDisabled: !existing || !slot,
		assign: (slotIndex) => {
			if (slot) slotsStore.assignParamToPage(slot, slotIndex, location, moduleIndex, paramIndex, isLed);
		},
		deassign: () => {
			if (slot && existing) slotsStore.deassignParamPage(slot, existing.slotIndex);
		},
	});
}

// Global Parameter Pages sibling of buildParamPageMenuItems above — "Assign to Global Page"
// submenu on a module parameter. Available regardless of ParameterPages.vue's toggle state
// (assigning from canvas doesn't require Global Pages to be the currently *displayed* toolbar
// page). `slot` here is which patch's module is being assigned — becomes the assignment's
// `slot` field, since a Global Page slot can target any of the 4 patches.
export function buildGlobalParamPageMenuItems(opts: {
	slot: SlotLabel | null;
	location: 0 | 1 | 2;
	moduleIndex: number;
	paramIndex: number; // LED number when isLed
	existing: GlobalParamPageAssignment | undefined;
	isLed?: 0 | 1; // 1 = level meter target, see ParamPageAssignment.isLed
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramIndex, existing, isLed = 0 } = opts;

	return buildParamPageMenuItemsImpl(slot, existing, {
		assignLabel: 'Assign to Global Page',
		deassignPrefix: 'Deassign Global',
		deassignDisabled: !existing,
		assign: (slotIndex) => {
			if (slot) slotsStore.assignParamToGlobalPage(slot, slotIndex, location, moduleIndex, paramIndex, isLed);
		},
		deassign: () => {
			if (existing) slotsStore.deassignGlobalParamPage(existing.slotIndex);
		},
	});
}

// Shared by buildModuleAssignMenuItems/buildGlobalModuleAssignMenuItems below — both bulk-assign
// ALL of a module's parameters to consecutive Parameter Page knob slots, differing only in the
// assign store call and the top-level menu label.
function buildModuleAssignMenuItemsImpl(
	slot: SlotLabel | null,
	paramIndices: number[],
	label: string,
	assign: (slotIndex: number, paramIndices: number[]) => void,
): ContextMenuItem[] {
	if (paramIndices.length === 0) return [];

	const pageItems: ContextMenuItem[] = PAGE_LETTERS.map((letter, page) => {
		const children: ContextMenuItem[] = [
			{
				label: `Multi Column (${paramIndices.length})`,
				action: () => assign(slotIndexFor(0, page, 0), paramIndices),
			},
		];
		for (let bank = 0; bank < BANK_COUNT; bank++) {
			children.push({
				label: `Column ${bank + 1}`,
				action: () => assign(slotIndexFor(bank, page, 0), paramIndices.slice(0, KNOBS_PER_PAGE)),
			});
		}
		return { label: `Page ${letter}`, children };
	});

	return [{ label, disabled: !slot, children: pageItems }];
}

// Module-background right-click "Assign" submenu — bulk-assigns ALL of a module's parameters
// (moduleDef's Assign order, minus params the original skips) to consecutive Parameter Page knob slots. Matches the manual's
// "Assign|Page X|Multi Column" / "Assign|Page X|Column N" popup menu: Multi Column spreads the
// module across as many pages as it needs starting at that page's first column; Column N confines
// it to that single 8-knob column (both truncate rather than erroring — see assignModuleToPage).
export function buildModuleAssignMenuItems(opts: { slot: SlotLabel | null; location: 0 | 1; moduleIndex: number; paramIndices: number[] }): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramIndices } = opts;

	return buildModuleAssignMenuItemsImpl(slot, paramIndices, 'Assign', (slotIndex, indices) => {
		if (slot) slotsStore.assignModuleToPage(slot, slotIndex, location, moduleIndex, indices);
	});
}

// Global Parameter Pages sibling of buildModuleAssignMenuItems above — "Global Assign" submenu on a
// module's background. `slot` is which patch's module is being assigned, same as
// buildGlobalParamPageMenuItems.
export function buildGlobalModuleAssignMenuItems(opts: {
	slot: SlotLabel | null;
	location: 0 | 1;
	moduleIndex: number;
	paramIndices: number[];
}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const { slot, location, moduleIndex, paramIndices } = opts;

	return buildModuleAssignMenuItemsImpl(slot, paramIndices, 'Global Assign', (slotIndex, indices) => {
		if (slot) slotsStore.assignModuleToGlobalPage(slot, slotIndex, location, moduleIndex, indices);
	});
}

// Alt-held state, refcounted via useKeyHoldOverlay's shared registry. Gates the Parameter Pages
// assign-drag affordances so they only arm while Alt is physically held and never compete with the
// mousedown-based knob-value-drag / Ctrl+drag-morph gestures on the same elements: :draggable and
// pointer-events on the toolbar knobs (ParameterPages.vue), and the drag cursors (ParamDragGhost.vue).
export function useAltHeld() {
	const { isVisible } = useKeyHoldOverlay('Alt');
	return { altHeld: isVisible };
}
