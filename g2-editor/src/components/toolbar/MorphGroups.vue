<template>
	<div class="morph-groups-panel flex flex-col items-center border border-line-default rounded px-2 py-0.5">
		<div class="text-[10px] font-semibold text-center leading-none mb-0.5">Morph Groups</div>
		<div class="flex items-center gap-2">
			<template v-for="(name, i) in MORPH_NAMES" :key="i">
				<div
					class="relative flex flex-col items-center"
					@contextmenu.prevent.stop="onGroupContextMenu(i, $event)"
					@dragover.prevent
					@drop="onMorphCCDrop(i, $event)"
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
					<span class="text-[9px] leading-none mb-0.5">{{ name }}</span>
					<div class="knob-frame" :class="{ selected: uiStore.selectedMorphGroup === i }" @click="uiStore.setSelectedMorphGroup(i)">
						<Knob
							:value="patchParams?.[uiStore.variation]?.morphDials?.[i] ?? 0"
							:color-variant="uiStore.selectedMorphGroup === i ? 'red' : null"
							@change="(val) => slotsStore.setMorphParam(uiStore.variation, i, 'dial', val)"
						/>
					</div>
					<MorphSourceSelect
						:model-value="patchParams?.[uiStore.variation]?.morphModes?.[i] ?? 0"
						:morph-idx="i"
						:selected="uiStore.selectedMorphGroup === i"
						@update:model-value="(val) => slotsStore.setMorphParam(uiStore.variation, i, 'mode', val)"
					/>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import MidiBadge from '../canvas/MidiBadge.vue';
	import Knob from '../common/Knob.vue';
	import MorphSourceSelect from './MorphSourceSelect.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useDeviceStore } from '../../store/device';
	import { MORPH_NAMES } from '../../types/patch';
	import type { ContextMenuItem } from '../../types';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { buildCCMenuItems, parseCCDragPayload, useMidiCCOverlay } from '../../composables/useMidiCC';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const deviceStore = useDeviceStore();
	const { open: openContextMenu } = useContextMenu();
	const { showCCOverlay } = useMidiCCOverlay();

	const patchParams = computed(() => slotsStore.getPatchParams(uiStore.slotInFocus));

	function getMorphCC(morphIdx: number): number | null {
		const slot = uiStore.slotInFocus;
		if (!slot) return null;
		return slotsStore.slots[slot].controllers.find((c) => c.location === 2 && c.paramIndex === morphIdx)?.cc ?? null;
	}

	function onGroupContextMenu(groupIndex: number, event: MouseEvent) {
		const slot = uiStore.slotInFocus;
		const variation = uiStore.variation;
		const items: ContextMenuItem[] = [
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
		const data = parseCCDragPayload(event);
		if (!data) return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		slotsStore.assignMidiCC(slot, 2, 1, morphIdx, data.cc);
	}
</script>

<style scoped>
	.knob-frame {
		padding: 1px;
		border-radius: 4px;
		cursor: pointer;
	}
	.knob-frame.selected {
		box-shadow: 0 0 0 2px #fff;
		border-radius: 50%;
	}
</style>
