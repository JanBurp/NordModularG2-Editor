<template>
	<div class="w-68 bg-surface-1 border-l border-line-subtle flex flex-col">
		<div class="flex-1 overflow-hidden overflow-y-auto">
			<PatchBrowser v-show="uiStore.rightPaneTab === 'browser'" :isActive="uiStore.rightPaneTab === 'browser'" @select="patchFile.handlePatchSelect" />
			<ModulesPane v-show="uiStore.rightPaneTab === 'modules'" :isActive="uiStore.rightPaneTab === 'modules'" />
			<MidiCCPane v-show="uiStore.rightPaneTab === 'midicc'" :isActive="uiStore.rightPaneTab === 'midicc'" />
			<SettingsPane v-show="uiStore.rightPaneTab === 'settings'" :isActive="uiStore.rightPaneTab === 'settings'" />
		</div>
	</div>
</template>

<script setup lang="ts">
	import SettingsPane from './SettingsPane.vue';
	import ModulesPane from './ModulesPane.vue';
	import PatchBrowser from './PatchBrowser.vue';
	import MidiCCPane from './MidiCCPane.vue';
	import { useUiStore } from '@/store/ui';
	import { usePatchFile } from '@/composables/usePatchFile';

	const uiStore = useUiStore();
	const patchFile = usePatchFile();
</script>
