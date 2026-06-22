<template>
	<div class="status-bar flex items-center justify-between gap-3 bg-surface-1 border-t border-line-subtle text-xs text-content-secondary">
		<BtnGroup
			:model-value="uiStore.area"
			:options="AREA_OPTIONS"
			variant="toggle"
			@update:model-value="handleAreaChange"
			@toggle-off="handleAreaToggleOff"
		/>

		<div v-if="currentPatch" class="flex items-center gap-2" data-testid="status-counts">
			<span>Voice: {{ areaCount('voice', 'modules') }} modules / {{ areaCount('voice', 'cables') }} cables</span>
			<span>FX: {{ areaCount('fx', 'modules') }} modules / {{ areaCount('fx', 'cables') }} cables</span>
		</div>

		<BtnGroup
			:model-value="settingsStore.rightPaneTab"
			:options="PANE_TAB_OPTIONS"
			variant="tab"
			@update:model-value="(tab) => settingsStore.toggleSidebar(tab as PaneTab)"
			@toggle-off="(tab) => settingsStore.toggleSidebar(tab as PaneTab)"
		/>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { useUiStore } from '../../store/ui';
	import { useSlotsStore } from '../../store/slots';
	import BtnGroup from './BtnGroup.vue';
	import { AREA_OPTIONS, PANE_TAB_OPTIONS } from '../../constants';
	import { useSettingsStore } from '../../store/settings';
	import type { PaneTab } from '../../store/settings';
	import { useAreaMode } from '../../composables/useAreaMode';

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const settingsStore = useSettingsStore();
	const { handleAreaChange, handleAreaToggleOff } = useAreaMode();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	function areaCount(area: 'voice' | 'fx', type: 'modules' | 'cables'): number {
		const i = area === 'voice' ? 1 : 0;
		return type === 'modules' ? (currentPatch.value?.areas?.[i]?.modules?.length ?? 0) : (currentPatch.value?.areas?.[i]?.cableList?.length ?? 0);
	}
</script>
