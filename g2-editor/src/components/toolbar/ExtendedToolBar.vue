<template>
	<ToolBar>
		<div class="flex flex-col gap-2">
			<Button variant="default" size="xs" @click="patchFile.newPatch()">New</Button>
			<Button variant="default" size="xs" @click="patchFile.loadInitPatch(1)">Init 1</Button>
			<Button variant="default" size="xs" @click="patchFile.loadInitPatch(2)">Init 2</Button>
		</div>

		<ModulePicker class="ml-1" />

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
	import Button from './Button.vue';
	import ModulePicker from './ModulePicker.vue';
	import UndoRedo from './UndoRedo.vue';
	import ColorPicker from '../common/ColorPicker.vue';
	import CPU from './CPU.vue';
	import MorphGroups from './MorphGroups.vue';
	import { useSlotsStore } from '../../store/slots';
	import { usePatchFile } from '../../composables/usePatchFile';
	import ToolBarDivider from './ToolBarDivider.vue';

	defineProps<{ patchName: string }>();

	const slotsStore = useSlotsStore();
	const patchFile = usePatchFile();
</script>
