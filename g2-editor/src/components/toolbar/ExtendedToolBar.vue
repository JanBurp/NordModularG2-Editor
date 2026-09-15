<template>
	<ToolBar>
		<div class="flex flex-col gap-2">
			<Button variant="default" size="xs" @click="patchFile.newPatch()">New</Button>
			<Button variant="default" size="xs" @click="patchFile.loadInitPatch(1)">Init 1</Button>
			<Button variant="default" size="xs" @click="patchFile.loadInitPatch(2)">Init 2</Button>
		</div>

		<template v-if="mode === 'classic'">
			<ModulePicker class="ml-1" />
			<div class="flex items-center flex-col gap-4 ml-4">
				<UndoRedo />
				<ColorPicker />
			</div>
		</template>

		<ParameterPagesGroup v-if="mode === 'compact'" compact />

		<div class="flex flex-col gap-4 items-center ml-4">
			<CPU :va="vaResources" :fx="fxResources" :compact="mode === 'compact'" />
		</div>

		<MorphGroups class="ml-4" @morph-group-label-edit="(info) => emit('morphGroupLabelEdit', info)" />

		<span class="ml-auto"></span>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBar from './ToolBar.vue';
	import Button from './Button.vue';
	import ModulePicker from './ModulePicker.vue';
	import UndoRedo from './UndoRedo.vue';
	import ColorPicker from '../common/ColorPicker.vue';
	import CPU from './CPU.vue';
	import MorphGroups from './MorphGroups.vue';
	import ParameterPagesGroup from './ParameterPagesGroup.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { usePatchFile } from '../../composables/usePatchFile';
	import { areaConfig } from '../../store/slotHelpers';

	withDefaults(defineProps<{ mode?: 'classic' | 'compact' }>(), { mode: 'classic' });
	const emit = defineEmits<{ morphGroupLabelEdit: [info: { groupIndex: number; currentLabel: string }] }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const patchFile = usePatchFile();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	function areaCount(area: 'voice' | 'fx', type: 'modules' | 'cables'): number {
		const i = areaConfig(area).areaIdx;
		return type === 'modules' ? (currentPatch.value?.areas?.[i]?.modules?.length ?? 0) : (currentPatch.value?.areas?.[i]?.cableList?.length ?? 0);
	}

	const vaResources = computed(() => ({
		...slotsStore.activeSlotResources.va,
		modules: areaCount('voice', 'modules'),
		cables: areaCount('voice', 'cables'),
	}));
	const fxResources = computed(() => ({
		...slotsStore.activeSlotResources.fx,
		modules: areaCount('fx', 'modules'),
		cables: areaCount('fx', 'cables'),
	}));
</script>
