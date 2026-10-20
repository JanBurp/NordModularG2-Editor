<template>
	<ToolBarGroup class="flex flex-col items-center pt-1">
		<div class="flex items-center gap-2">
			<template v-for="(_, i) in MORPH_NAMES" :key="i">
				<div
					class="relative flex flex-col items-center min-w-14 gap-1"
					@contextmenu.prevent.stop="onGroupContextMenu(i, $event)"
					@dragover.prevent
					@drop="onMorphCCDrop(i, $event)"
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
						<span class="text-xs text-black truncate">{{ displayName(i) }}</span>
					</div>
					<Knob
						:value="patchParams?.[uiStore.variation]?.morphDials?.[i] ?? 0"
						:color-variant="uiStore.selectedMorphGroup === i ? 'red' : assignedGroups.has(i) ? 'blue' : null"
						:default-value="defaultPatchParams().morphDials[i]"
						@change="(val) => slotsStore.setMorphParam(uiStore.variation, i, 'dial', val)"
						@click="uiStore.setSelectedMorphGroup(i)"
					/>
					<MorphSourceSelect
						:model-value="patchParams?.[uiStore.variation]?.morphModes?.[i] ?? 0"
						:morph-idx="i"
						@mouseenter="showHint('morphSource')"
						@mouseleave="showHint('morphKnob')"
						@update:model-value="(val) => slotsStore.setMorphParam(uiStore.variation, i, 'mode', val)"
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
	import { defaultPatchParams } from '../../store/slotHelpers';
	import { useUiStore } from '../../store/ui';
	import { useDeviceStore } from '../../store/device';
	import { MORPH_NAMES } from '../../types/patch';
	import type { ContextMenuItem } from '../../types';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { buildCCMenuItems, useMidiCCOverlay } from '../../composables/useMidiCC';
	import { parseDragPayload } from '../../utils/dragPayload';
	import { usePatchParams } from '../../composables/usePatchParams';
	import { useStatusHint } from '../../composables/useStatusHint';
	import ToolBarGroup from './ToolBarGroup.vue';

	const emit = defineEmits<{ morphGroupLabelEdit: [info: { groupIndex: number; currentLabel: string }] }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
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

	function displayName(i: number): string {
		return activePatch.value?.morphParamLabels?.find((pl) => pl.paramIndex === 8 + i)?.labels?.[0] || MORPH_NAMES[i];
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
		openContextMenu(event, items);
	}

	function onMorphCCDrop(morphIdx: number, event: DragEvent) {
		const data = parseDragPayload(event);
		if (data?.type !== 'cc') return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		slotsStore.assignMidiCC(slot, 2, 1, morphIdx, data.cc);
	}
</script>
