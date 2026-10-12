<template>
	<div class="flex bg-surface-1 border-t border-line-subtle">
		<VirtualKeyboard class="flex-1 min-w-0" />
		<PatchAdjuster v-if="settingsStore.showPatchAdjuster" class="shrink-0 border-l border-line-subtle" />
	</div>
</template>

<script setup lang="ts">
	import VirtualKeyboard from './VirtualKeyboard.vue';
	import PatchAdjuster from './PatchAdjuster.vue';
	import { useSettingsStore } from '../../store/settings';

	const settingsStore = useSettingsStore();
</script>
