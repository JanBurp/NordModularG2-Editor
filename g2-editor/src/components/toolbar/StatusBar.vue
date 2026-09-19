<template>
	<div class="status-bar flex items-center justify-between gap-3 bg-surface-1 border-t border-line-subtle text-xs text-content-secondary">
		<BtnGroup
			:model-value="uiStore.area"
			:options="AREA_OPTIONS"
			variant="variation"
			size="small"
			testIdPrefix="area"
			@update:model-value="handleAreaChange"
			@toggle-off="handleAreaToggleOff"
		/>

		<span class="cursor-pointer hover:text-content-primary truncate" @click="uiStore.showKeyCommandsPage = true">
			{{ uiStore.statusHint ?? 'Click for keyboard shortcuts' }}
		</span>

		<BtnGroup
			:model-value="settingsStore.rightPaneTab"
			:options="PANE_TAB_OPTIONS"
			variant="variation"
			size="small"
			@update:model-value="(tab) => settingsStore.toggleSidebar(tab as PaneTab)"
			@toggle-off="(tab) => settingsStore.toggleSidebar(tab as PaneTab)"
		/>
	</div>
</template>

<script setup lang="ts">
	import { useUiStore } from '../../store/ui';
	import BtnGroup from './BtnGroup.vue';
	import { AREA_OPTIONS, PANE_TAB_OPTIONS } from '../../constants';
	import { useSettingsStore } from '../../store/settings';
	import type { PaneTab } from '../../store/settings';
	import { useAreaMode } from '../../composables/useAreaMode';

	const uiStore = useUiStore();
	const settingsStore = useSettingsStore();
	const { handleAreaChange, handleAreaToggleOff } = useAreaMode();
</script>
