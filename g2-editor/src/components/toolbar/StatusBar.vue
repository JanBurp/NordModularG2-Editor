<template>
	<div class="flex items-center justify-between gap-2 bg-neutral-800 border-t border-neutral-700 text-xs text-neutral-400">
		<BtnGroup v-model="uiStore.area" size="small" :options="AREA_OPTIONS" variant="toggle" />

		<div v-if="currentPatch" class="flex items-center gap-2">
			<span>Voice: {{ areaCount('voice', 'modules') }} modules / {{ areaCount('voice', 'cables') }} cables</span>
			<span>FX: {{ areaCount('fx', 'modules') }} modules / {{ areaCount('fx', 'cables') }} cables</span>
		</div>

		<BtnGroup
			:model-value="uiStore.rightPaneTab"
			:options="PANE_TAB_OPTIONS"
			variant="tab"
			size="small"
			@update:model-value="(tab) => uiStore.toggleSidebar(tab as PaneTab)"
			@toggle-off="(tab) => uiStore.toggleSidebar(tab as PaneTab)"
		/>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { useUiStore } from '../../store/ui';
	import { useSlotsStore } from '../../store/slots';
	import BtnGroup from './BtnGroup.vue';
	import { AREA_OPTIONS, PANE_TAB_OPTIONS } from '../../constants';
	import type { PaneTab } from '../../store/ui';

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	function areaCount(area: 'voice' | 'fx', type: 'modules' | 'cables'): number {
		const i = area === 'voice' ? 1 : 0;
		return type === 'modules' ? (currentPatch.value?.areas?.[i]?.modules?.length ?? 0) : (currentPatch.value?.areas?.[i]?.cableList?.length ?? 0);
	}
</script>
