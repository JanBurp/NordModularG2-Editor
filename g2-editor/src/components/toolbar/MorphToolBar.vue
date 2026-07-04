<template>
	<ToolBar v-if="patchName">
		<ToolBarLabel class="w-10">Morphs:</ToolBarLabel>
		<div class="flex items-center gap-2">
			<template v-for="(name, i) in MORPH_NAMES" :key="i">
				<div
					class="relative flex flex-col items-center"
					@contextmenu.prevent.stop="onMorphContextMenu(i, $event)"
					@dragover.prevent
					@drop="onMorphCCDrop(i, $event)"
				>
					<svg v-if="showCCOverlay && getMorphCC(i) !== null" class="absolute -top-1 left-1/2 z-10 hover:z-20" width="1" height="14" overflow="visible">
						<MidiBadge :text="`CC# ${getMorphCC(i)}`" :x="0" :y="0" anchor="top-center" />
					</svg>
					<Knob
						:value="patchParams?.[uiStore.variation]?.morphDials?.[i] ?? 0"
						@change="(val) => slotsStore.setMorphParam(uiStore.variation, i, 'dial', val)"
					/>
					<MorphSourceSelect
						:model-value="patchParams?.[uiStore.variation]?.morphModes?.[i] ?? 0"
						:morph-idx="i"
						@update:model-value="(val) => slotsStore.setMorphParam(uiStore.variation, i, 'mode', val)"
					/>
				</div>
			</template>
		</div>

		<span class="ml-auto"></span>
		<ToolBarLabel>Patch Level:</ToolBarLabel>
		<div class="h-6 flex items-center gap-2">
			<Knob :value="patchParams?.[uiStore.variation]?.patchVol ?? 100" @change="(val) => slotsStore.setPatchParam(uiStore.variation, 'patchVol', val)" />
			<CheckBox
				:model-value="(patchParams?.[uiStore.variation]?.activeMuted ?? 1) === 1"
				@update:model-value="(val) => slotsStore.setPatchParam(uiStore.variation, 'activeMuted', val ? 1 : 0)"
			/>
		</div>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import MidiBadge from '../canvas/MidiBadge.vue';
	import Knob from '../common/Knob.vue';
	import CheckBox from '../common/CheckBox.vue';
	import MorphSourceSelect from './MorphSourceSelect.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useDeviceStore } from '../../store/device';
	import { MORPH_NAMES } from '../../types/patch';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { buildCCMenuItems, parseCCDragPayload, useMidiCCOverlay } from '../../composables/useMidiCC';

	defineProps<{ patchName: string }>();

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

	function onMorphContextMenu(morphIdx: number, event: MouseEvent) {
		const slot = uiStore.slotInFocus;
		const lastCC = deviceStore.lastMidiCC;
		const existing = slot ? slotsStore.slots[slot].controllers.find((c) => c.location === 2 && c.paramIndex === morphIdx) : undefined;
		const items = buildCCMenuItems({
			lastCC,
			existing,
			enabled: !!slot,
			onAssign: (cc) => slot && slotsStore.assignMidiCC(slot, 2, 1, morphIdx, cc),
			onDeassign: () => slot && existing && slotsStore.deassignMidiCC(slot, existing.cc),
		});
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
