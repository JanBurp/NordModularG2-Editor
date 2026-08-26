<template>
	<ToolBar v-if="patchName">
		<ModulePicker class="ml-13" />

		<div class="flex items-center flex-col gap-4 ml-4">
			<UndoRedo />
			<ColorPicker />
		</div>

		<div class="flex flex-col gap-4 items-center ml-4">
			<CPU :va="slotsStore.activeSlotResources.va" :fx="slotsStore.activeSlotResources.fx" />
		</div>

		<MorphGroups class="ml-4" />

		<span class="ml-auto"></span>
	</ToolBar>
</template>

<script setup lang="ts">
	import ToolBar from './ToolBar.vue';
	import ModulePicker from './ModulePicker.vue';
	import UndoRedo from './UndoRedo.vue';
	import ColorPicker from '../common/ColorPicker.vue';
	import CPU from './CPU.vue';
	import MorphGroups from './MorphGroups.vue';
	import { useSlotsStore } from '../../store/slots';
	import ToolBarDivider from './ToolBarDivider.vue';

	defineProps<{ patchName: string }>();

	const slotsStore = useSlotsStore();
</script>
