<template>
	<ToolBarLabel>Patch Level:</ToolBarLabel>
	<div class="h-6 flex items-center gap-2">
		<Knob :value="patchParams?.[uiStore.variation]?.patchVol ?? 100" @change="(val) => slotsStore.setPatchParam(uiStore.variation, 'patchVol', val)" />
		<CheckBox
			:model-value="(patchParams?.[uiStore.variation]?.activeMuted ?? 1) === 1"
			@update:model-value="(val) => slotsStore.setPatchParam(uiStore.variation, 'activeMuted', val ? 1 : 0)"
		/>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import Knob from '../common/Knob.vue';
	import CheckBox from '../common/CheckBox.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const patchParams = computed(() => slotsStore.getPatchParams(uiStore.slotInFocus));
</script>
