<template>
	<ToolBar v-if="patchName">
		<ToolBarLabel>Morph:</ToolBarLabel>
		<div class="flex items-center gap-2">
			<template v-for="(name, i) in MORPH_NAMES" :key="i">
				<div class="flex flex-col items-center">
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
		<ToolBarLabel>Patch<br />Level:</ToolBarLabel>
		<div class="h-6 flex items-center">
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
	import ToolBarDivider from './ToolBarDivider.vue';
	import Knob from '../common/Knob.vue';
	import CheckBox from '../common/CheckBox.vue';
	import MorphSourceSelect from './MorphSourceSelect.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { MORPH_NAMES } from '../../types/patch';

	defineProps<{ patchName: string }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const patchParams = computed(() => slotsStore.getPatchParams(uiStore.slotInFocus));
</script>
