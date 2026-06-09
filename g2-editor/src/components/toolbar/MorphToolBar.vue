<template>
	<ToolBar v-if="patchName">
		<ToolBarLabel>Morph:</ToolBarLabel>
		<template v-for="(name, i) in MORPH_NAMES" :key="i">
			<div class="flex flex-col items-center gap-1">
				<Knob
					class="-mt-2"
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

		<ToolBarLabel class="ml-auto">Patch<br />Level:</ToolBarLabel>
		<div class="h-6 flex items-baseline">
			<Knob
				class="-mt-1"
				:value="patchParams?.[uiStore.variation]?.patchVol ?? 100"
				@change="(val) => slotsStore.setPatchParam(uiStore.variation, 'patchVol', val)"
			/>
			<Switch
				:value="patchParams?.[uiStore.variation]?.activeMuted ?? 1"
				paramType="ActiveMonitor"
				@change="(val) => slotsStore.setPatchParam(uiStore.variation, 'activeMuted', val)"
			/>
		</div>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import Knob from '../common/Knob.vue';
	import Switch from '../common/Switch.vue';
	import MorphSourceSelect from './MorphSourceSelect.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { MORPH_NAMES } from '../../types/patch';

	defineProps<{ patchName: string }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const patchParams = computed(() => slotsStore.getPatchParams(uiStore.slotInFocus));
</script>
