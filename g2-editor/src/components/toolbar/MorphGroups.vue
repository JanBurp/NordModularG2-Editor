<template>
	<ToolBarGroup class="flex flex-col items-center pt-1" data-hint-bounds>
		<div class="flex items-center gap-2">
			<template v-for="(_, i) in MORPH_NAMES" :key="i">
				<div
					class="relative flex flex-col items-center min-w-14 gap-1"
					:data-morph-group="i"
					@contextmenu.prevent.stop="onGroupContextMenu(i, $event)"
					@mousedown.capture="onMorphMouseDown(i, $event)"
					@dragover.prevent
					@drop="onMorphDrop(i, $event)"
					@mouseenter="showHint('morphKnob')"
					@mouseleave="clearHint"
				>
					<svg
						v-if="showCCOverlay && getMorphCC(i) !== null"
						class="absolute -top-1 left-1/2 z-10 hover:z-20"
						width="1"
						height="14"
						overflow="visible"
					>
						<MidiBadge :text="`CC# ${getMorphCC(i)}`" :x="0" :y="0" anchor="top-center" />
					</svg>
					<div class="w-full rounded-xs px-1 text-center bg-input-dimmed">
						<span class="text-xs text-black truncate"><SearchHit :text="displayName(i)" :hit="searchMatch(i)" tag="span" /></span>
					</div>
					<Knob
						data-testid="morph-group-knob"
						:value="morphDial(i)"
						:color-variant="uiStore.selectedMorphGroup === i ? 'red' : assignedGroups.has(i) ? 'blue' : null"
						:default-value="defaultPatchParams().morphDials[i]"
						v-on="dialHints[i].on"
						@mousedown.capture="showMorphValues(i)"
						@change="(val) => onDialChange(i, val)"
						@click="uiStore.setSelectedMorphGroup(i)"
					/>
					<MorphSourceSelect
						:model-value="morphMode(i)"
						:morph-idx="i"
						v-on="modeHints[i].on"
						@mouseenter="showHint('morphSource')"
						@mouseleave="showHint('morphKnob')"
						@update:model-value="(val) => onModeChange(i, val)"
					/>
				</div>
			</template>
		</div>
	</ToolBarGroup>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import MidiBadge from '../canvas/MidiBadge.vue';
	import Knob from '../common/Knob.vue';
	import MorphSourceSelect from './MorphSourceSelect.vue';
	import { useSlotsStore } from '../../store/slots';
	import { defaultPatchParams, morphGroupName } from '../../store/slotHelpers';
	import { useUiStore } from '../../store/ui';
	import { useSearchReplace } from '../../composables/useSearchReplace';
	import SearchHit from '../common/SearchHit.vue';
	import { useDeviceStore } from '../../store/device';
	import { MORPH_MODE_OPTIONS, MORPH_NAMES } from '../../types/patch';
	import type { ContextMenuItem } from '../../types';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { buildCCMenuItems, useMidiCCOverlay } from '../../composables/useMidiCC';
	import { parseDragPayload } from '../../utils/dragPayload';
	import { buildGlobalParamPageMenuItems, buildParamPageMenuItems } from '../../composables/useParamPageAssign';
	import { startParamPageDrag } from '../../composables/useParamPageDrag';
	import { PATCH_MORPH_MODULE_ID } from '../../parser/constants';
	import { usePatchParams } from '../../composables/usePatchParams';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { TOOLBAR_HINT, useToolbarValueHint } from '../../composables/useValueHint';
	import ToolBarGroup from './ToolBarGroup.vue';

	const emit = defineEmits<{ morphGroupLabelEdit: [info: { groupIndex: number; currentLabel: string }] }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const search = useSearchReplace();
	function searchMatch(i: number): 'match' | 'current' | null {
		if (!search.searching.value) return null;
		const key = `morph:${i}`;
		return search.currentKey.value === key ? 'current' : search.matchKeys.value.has(key) ? 'match' : null;
	}
	const deviceStore = useDeviceStore();
	const { open: openContextMenu } = useContextMenu();
	const { showCCOverlay } = useMidiCCOverlay();
	const { showHint, clearHint } = useStatusHint();

	const { patchParams } = usePatchParams();

	const activePatch = computed(() => {
		const slot = uiStore.slotInFocus;
		return slot ? slotsStore.getPatchForSlot(slot) : null;
	});

	// Groups with at least one assignment in the current variation (shown as a blue knob).
	const assignedGroups = computed(() => {
		const slot = uiStore.slotInFocus;
		return new Set(slot ? slotsStore.getMorphAssignments(slot, uiStore.variation).map((a) => a.groupIndex) : []);
	});

	const morphDial = (i: number) => patchParams.value?.[uiStore.variation]?.morphDials?.[i] ?? 0;
	const morphMode = (i: number) => patchParams.value?.[uiStore.variation]?.morphModes?.[i] ?? 0;

	// Value hints (official CMorphContainer): knob i = morph param i, mode button i = param 8 + i.
	const toolbarHint = useToolbarValueHint();
	const dialHints = MORPH_NAMES.map((_, i) => toolbarHint(TOOLBAR_HINT.morph, i, () => String(morphDial(i)), 'morph'));
	const modeHints = MORPH_NAMES.map((_, i) => toolbarHint(TOOLBAR_HINT.morph, 8 + i, () => MORPH_MODE_OPTIONS[i][morphMode(i)] ?? '', 'morphMode'));
	function onDialChange(i: number, val: number) {
		slotsStore.setMorphParam(uiStore.variation, i, 'dial', val);
		dialHints[i].changed();
	}
	function onModeChange(i: number, val: number) {
		slotsStore.setMorphParam(uiStore.variation, i, 'mode', val);
		modeHints[i].changed();
	}

	// Holding a morph knob shows its group's morph start -- end values on the canvas until release.
	function showMorphValues(i: number) {
		uiStore.morphValuesGroup = i;
		window.addEventListener('mouseup', () => (uiStore.morphValuesGroup = null), { once: true });
	}

	function displayName(i: number): string {
		return morphGroupName(activePatch.value, i);
	}

	function getMorphCC(morphIdx: number): number | null {
		const slot = uiStore.slotInFocus;
		if (!slot) return null;
		return slotsStore.slots[slot].controllers.find((c) => c.location === 2 && c.paramIndex === morphIdx)?.cc ?? null;
	}

	function onGroupContextMenu(groupIndex: number, event: MouseEvent) {
		const slot = uiStore.slotInFocus;
		const variation = uiStore.variation;
		const items: ContextMenuItem[] = [
			{ label: 'Rename…', disabled: !slot, action: () => emit('morphGroupLabelEdit', { groupIndex, currentLabel: displayName(groupIndex) }) },
			{ label: 'Clear', disabled: !slot, action: () => slot && slotsStore.clearMorphGroup(slot, variation, groupIndex) },
			{
				label: 'Copy To',
				disabled: !slot,
				children: MORPH_NAMES.map((n, j) => ({
					label: `Group ${j + 1} (${n})`,
					disabled: j === groupIndex,
					action: () => slot && slotsStore.copyMorphGroup(slot, variation, groupIndex, j),
				})),
			},
			{ type: 'separator' },
		];

		const lastCC = deviceStore.lastMidiCC;
		const existing = slot ? slotsStore.slots[slot].controllers.find((c) => c.location === 2 && c.paramIndex === groupIndex) : undefined;
		items.push(
			...buildCCMenuItems({
				lastCC,
				existing,
				enabled: !!slot,
				onAssign: (cc) => slot && slotsStore.assignMidiCC(slot, 2, 1, groupIndex, cc),
				onDeassign: () => slot && existing && slotsStore.deassignMidiCC(slot, existing.cc),
			}),
		);

		// Parameter Pages / Global Parameter Pages knob assign/deassign, same menus as a canvas param
		// (Module.vue). A Morph Group is param `groupIndex` of the PATCH_MORPH pseudo-module (location 2).
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
		openContextMenu(event, items);
	}

	// Alt+drag a Morph knob onto a Parameter Pages toolbar knob to assign it — the same gesture (and
	// useParamPageDrag.ts drag) as a canvas param. Captured so the Knob's own value-drag never starts.
	function onMorphMouseDown(morphIdx: number, e: MouseEvent) {
		if (!e.altKey) return;
		startParamPageDrag(e, { location: 2, moduleIndex: PATCH_MORPH_MODULE_ID, paramIndex: morphIdx, label: displayName(morphIdx) });
	}

	// Drop target for a dragged MIDI CC row (assign a CC) and a dragged Parameter Pages knob (assign
	// this Morph Group to that knob slot), mirroring Module.vue's onParamDrop.
	function onMorphDrop(morphIdx: number, event: DragEvent) {
		const data = parseDragPayload(event);
		const slot = uiStore.slotInFocus;
		if (!data || !slot) return;
		if (data.type === 'cc') slotsStore.assignMidiCC(slot, 2, PATCH_MORPH_MODULE_ID, morphIdx, data.cc);
		else if (data.global) slotsStore.assignParamToGlobalPage(slot, data.slotIndex, 2, PATCH_MORPH_MODULE_ID, morphIdx);
		else slotsStore.assignParamToPage(slot, data.slotIndex, 2, PATCH_MORPH_MODULE_ID, morphIdx);
	}
</script>
