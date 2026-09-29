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

		<div class="flex items-center gap-3 min-w-0">
			<div v-if="browserStore.loading && namesLoadProgress" class="flex items-center gap-2 shrink-0" data-testid="names-progress">
				<span>Loading banks {{ namesLoadProgress.location }}/{{ namesLoadProgress.total }}</span>
				<div class="w-24 h-1.5 bg-surface-2 rounded overflow-hidden">
					<div
						class="h-full bg-orange-400 transition-all"
						:style="{ width: `${(namesLoadProgress.location / namesLoadProgress.total) * 100}%` }"
					></div>
				</div>
			</div>
			<span v-else class="cursor-pointer hover:text-content-primary truncate" @click="uiStore.showKeyCommandsPage = true">
				{{ uiStore.statusHint ?? 'Click for keyboard shortcuts' }}
			</span>
		</div>

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
	import { useBrowserStore } from '../../store/browser';
	import { namesLoadProgress } from '../../composables/useG2';
	import BtnGroup from './BtnGroup.vue';
	import { AREA_OPTIONS, PANE_TAB_OPTIONS } from '../../constants';
	import { useSettingsStore } from '../../store/settings';
	import type { PaneTab } from '../../store/settings';
	import { useAreaMode } from '../../composables/useAreaMode';

	const uiStore = useUiStore();
	const browserStore = useBrowserStore();
	const settingsStore = useSettingsStore();
	const { handleAreaChange, handleAreaToggleOff } = useAreaMode();
</script>
