<template>
	<ToolBarLabel>Patch Level:</ToolBarLabel>
	<div class="h-6 flex items-center gap-2">
		<Knob
			:value="patchVol()"
			:default-value="defaultPatchParams().patchVol"
			v-on="volHint.on"
			@change="onVolChange"
			@mouseenter="showHint('patchLevel')"
			@mouseleave="clearHint"
		/>
		<CheckBox
			:model-value="isActive()"
			v-on="activeHint.on"
			@update:model-value="onActiveChange"
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
	import { TOOLBAR_HINT, useToolbarValueHint } from '../../composables/useValueHint';

	const { showHint, clearHint } = useStatusHint();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const { patchParams } = usePatchParams();
	const patchVol = () => patchParams.value?.[uiStore.variation]?.patchVol ?? 100;
	const isActive = () => (patchParams.value?.[uiStore.variation]?.activeMuted ?? 1) === 1;

	const toolbarHint = useToolbarValueHint();
	const volHint = toolbarHint(TOOLBAR_HINT.patchLevel, 0, () => String(patchVol()));
	const activeHint = toolbarHint(TOOLBAR_HINT.patchLevel, 1, () => (isActive() ? 'On' : 'Off'));
	function onVolChange(val: number) {
		slotsStore.setPatchParam(uiStore.variation, 'patchVol', val);
		volHint.changed();
	}
	function onActiveChange(val: boolean) {
		slotsStore.setPatchParam(uiStore.variation, 'activeMuted', val ? 1 : 0);
		activeHint.changed();
	}
</script>
