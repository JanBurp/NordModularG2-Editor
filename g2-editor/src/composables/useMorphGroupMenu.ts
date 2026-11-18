import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { useDeviceStore } from '@/store/device';
import { morphGroupName } from '@/store/slotHelpers';
import { NUM_VISIBLE_VARIATIONS } from '@/store/mutator';
import { MORPH_MODE_OPTIONS, MORPH_NAMES } from '@/types/patch';
import type { ContextMenuItem } from '@/types';
import { PATCH_MORPH_MODULE_ID } from '@/parser/constants';
import { buildCCMenuItems } from './useMidiCC';
import { buildGlobalParamPageMenuItems, buildParamPageMenuItems } from './useParamPageAssign';
import { useMorphLabelDialog } from './useMorphLabelDialog';

// Right-click menu of a Morph Group (toolbar MorphGroups.vue and the Morph pane): rename, clear,
// source (when the toolbar hides its source buttons), copy, MIDI CC and Parameter Pages.
export function buildMorphGroupMenuItems(groupIndex: number, opts: { source?: boolean } = {}): ContextMenuItem[] {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const slot = uiStore.slotInFocus;
	const variation = uiStore.variation;
	const name = morphGroupName(slot ? slotsStore.getPatchForSlot(slot) : null, groupIndex);
	const mode = slotsStore.getPatchParams(slot)?.[variation]?.morphModes?.[groupIndex] ?? 0;

	// Variations 1-8 as copy targets: All, then each one (the current one disabled).
	const toVariations = (groups: number[] | null): ContextMenuItem[] => {
		const others = Array.from({ length: NUM_VISIBLE_VARIATIONS }, (_, v) => v).filter((v) => v !== variation);
		return [
			{ label: 'All', action: () => slotsStore.copyMorphToVariations(slot, variation, groups, others) },
			{ type: 'separator' },
			...Array.from({ length: NUM_VISIBLE_VARIATIONS }, (_, v) => ({
				label: String(v + 1),
				disabled: v === variation,
				action: () => slotsStore.copyMorphToVariations(slot, variation, groups, [v]),
			})),
		];
	};
	const items: ContextMenuItem[] = [
		{ label: 'Rename…', disabled: !slot, action: () => useMorphLabelDialog().openMorphLabelDialog(groupIndex, name) },
		{ label: 'Clear', disabled: !slot, action: () => slot && slotsStore.clearMorphGroup(slot, variation, groupIndex) },
		...(opts.source
			? [
					{
						label: `Source: ${MORPH_MODE_OPTIONS[groupIndex][mode]}`,
						disabled: !slot,
						children: MORPH_MODE_OPTIONS[groupIndex].map((n, m) => ({
							label: n,
							disabled: m === mode,
							action: () => slotsStore.setMorphParam(variation, groupIndex, 'mode', m),
						})),
					},
				]
			: []),
		{
			label: 'Copy To',
			disabled: !slot,
			children: MORPH_NAMES.map((n, j) => ({
				label: `Group ${j + 1} (${n})`,
				disabled: j === groupIndex,
				action: () => slot && slotsStore.copyMorphGroup(slot, variation, groupIndex, j),
			})),
		},
		{ label: 'Copy to Variations', disabled: !slot, children: toVariations([groupIndex]) },
		{ label: 'Copy all to Variations', disabled: !slot, children: toVariations(null) },
		{ type: 'separator' },
	];

	const existing = slot ? slotsStore.slots[slot].controllers.find((c) => c.location === 2 && c.paramIndex === groupIndex) : undefined;
	items.push(
		...buildCCMenuItems({
			lastCC: useDeviceStore().lastMidiCC,
			existing,
			slot,
			onAssign: (cc) => slot && slotsStore.assignMidiCC(slot, 2, 1, groupIndex, cc),
			onDeassign: () => slot && existing && slotsStore.deassignMidiCC(slot, existing.cc),
		}),
	);

	// Parameter Pages / Global Parameter Pages knob assign/deassign, same menus as a canvas param
	// (Module.vue). A Morph Group is param `groupIndex` of PATCH_MORPH_MODULE_ID at location 2.
	const isThisGroup = (k: { location: number; moduleIndex: number; paramIndex: number }) =>
		k.location === 2 && k.moduleIndex === PATCH_MORPH_MODULE_ID && k.paramIndex === groupIndex;
	const target = { slot, location: 2 as const, moduleIndex: PATCH_MORPH_MODULE_ID, paramIndex: groupIndex };
	items.push({ type: 'separator' });
	items.push(...buildParamPageMenuItems({ ...target, existing: slot ? slotsStore.slots[slot].paramPages.find(isThisGroup) : undefined }));
	items.push(
		...buildGlobalParamPageMenuItems({
			...target,
			existing: slot ? slotsStore.globalParamPages.find((k) => k.slot === slot && isThisGroup(k)) : undefined,
		}),
	);
	return items;
}
