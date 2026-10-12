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
			<span
				class="flex gap-4 min-w-0 overflow-hidden whitespace-nowrap cursor-pointer hover:text-content-primary"
				@click="uiStore.showKeyCommandsPage = true"
			>
				<span v-for="(part, i) in hintParts" :key="i">
					<span v-if="part.key" class="text-content-primary">{{ part.key }}:</span> {{ part.text }}
				</span>
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
	import { computed } from 'vue';
	import { useUiStore } from '../../store/ui';
	import BtnGroup from './BtnGroup.vue';
	import { AREA_OPTIONS, PANE_TAB_OPTIONS } from '../../constants';
	import { useSettingsStore } from '../../store/settings';
	import type { PaneTab } from '../../store/settings';
	import { useAreaMode } from '../../composables/useAreaMode';

	const uiStore = useUiStore();
	const settingsStore = useSettingsStore();
	const { handleAreaChange, handleAreaToggleOff } = useAreaMode();

	// 'Key: text · Key: text' → parts; the key (gesture/modifier) is highlighted.
	const hintParts = computed(() =>
		(uiStore.statusHint ?? 'Click for keyboard shortcuts').split(' · ').map((part) => {
			const i = part.indexOf(': ');
			return i < 0 ? { key: '', text: part } : { key: part.slice(0, i), text: part.slice(i + 2) };
		}),
	);
</script>
