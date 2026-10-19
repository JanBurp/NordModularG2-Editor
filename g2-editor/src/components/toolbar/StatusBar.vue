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
				<span v-for="(part, i) in hint.parts" :key="i">
					<span v-if="part.key" class="text-content-primary">{{ part.key }}:</span> {{ part.text }}
				</span>
				<span v-if="hint.mods.length" class="text-content-primary border-l border-line-default pl-4">{{ hint.mods.join(' ') }}</span>
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
	import { computed, onMounted, onUnmounted, ref } from 'vue';
	import { useUiStore } from '../../store/ui';
	import BtnGroup from './BtnGroup.vue';
	import { AREA_OPTIONS, PANE_TAB_OPTIONS } from '../../constants';
	import { useSettingsStore } from '../../store/settings';
	import type { PaneTab } from '../../store/settings';
	import { useAreaMode } from '../../composables/useAreaMode';
	import { groupHint } from '../../composables/useStatusHint';
	import { MOD, ALT } from '../../constants/statusHints';
	import { isMac } from '../../utils/platform';

	const uiStore = useUiStore();
	const settingsStore = useSettingsStore();
	const { handleAreaChange, handleAreaToggleOff } = useAreaMode();

	// Held modifier switches the hint to that modifier's gestures.
	const heldMod = ref<string | null>(null);
	function onModKey(e: KeyboardEvent) {
		heldMod.value = e.shiftKey ? 'Shift' : (isMac ? e.metaKey : e.ctrlKey) ? MOD : e.altKey ? ALT : null;
	}
	function onBlur() {
		heldMod.value = null;
	}
	onMounted(() => {
		window.addEventListener('keydown', onModKey, true);
		window.addEventListener('keyup', onModKey, true);
		window.addEventListener('blur', onBlur);
	});
	onUnmounted(() => {
		window.removeEventListener('keydown', onModKey, true);
		window.removeEventListener('keyup', onModKey, true);
		window.removeEventListener('blur', onBlur);
	});

	// The key (gesture/modifier) is highlighted.
	const hint = computed(() => groupHint(uiStore.statusHint ?? 'Click for keyboard shortcuts', heldMod.value));
</script>
