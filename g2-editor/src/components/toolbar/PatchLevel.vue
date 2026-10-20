<template>
	<ToolBarLabel>Patch Level:</ToolBarLabel>
	<div class="h-6 flex items-center gap-2">
		<Knob
			:value="patchParams?.[uiStore.variation]?.patchVol ?? 100"
			:default-value="defaultPatchParams().patchVol"
			@change="(val) => slotsStore.setPatchParam(uiStore.variation, 'patchVol', val)"
			@mouseenter="showHint('patchLevel')"
			@mouseleave="clearHint"
		/>
		<CheckBox
			:model-value="(patchParams?.[uiStore.variation]?.activeMuted ?? 1) === 1"
			@update:model-value="(val) => slotsStore.setPatchParam(uiStore.variation, 'activeMuted', val ? 1 : 0)"
			@mouseenter="showHint('patchActive')"
			@mouseleave="clearHint"
		/>
	</div>
</template>

<script setup lang="ts">
	import ToolBarLabel from './ToolBarLabel.vue';
	import Knob from '../common/Knob.vue';
	import CheckBox from '../common/CheckBox.vue';
	import { useSlotsStore } from '../../store/slots';
	import { defaultPatchParams } from '../../store/slotHelpers';
	import { useUiStore } from '../../store/ui';
	import { usePatchParams } from '../../composables/usePatchParams';
	import { useStatusHint } from '../../composables/useStatusHint';

	const { showHint, clearHint } = useStatusHint();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const { patchParams } = usePatchParams();
</script>
