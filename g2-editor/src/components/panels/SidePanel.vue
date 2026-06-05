<template>
	<div class="w-68 bg-neutral-800 border-l border-neutral-700 flex flex-col">
		<div class="flex-1 overflow-hidden overflow-y-auto">
			<SettingsPane v-show="uiStore.rightPaneTab === 'settings'" />
			<ModulesPane v-show="uiStore.rightPaneTab === 'modules'" :isActive="uiStore.rightPaneTab === 'modules'" />
			<PatchBrowser v-show="uiStore.rightPaneTab === 'browser'" :isActive="uiStore.rightPaneTab === 'browser'" @select="patchFile.handlePatchSelect" />
		</div>
	</div>
</template>

<script setup lang="ts">
	import SettingsPane from './SettingsPane.vue';
	import ModulesPane from './ModulesPane.vue';
	import PatchBrowser from './PatchBrowser.vue';
	import { useUiStore } from '@/store/ui';
	import { usePatchFile } from '@/composables/usePatchFile';

	const uiStore = useUiStore();
	const patchFile = usePatchFile();
</script>
