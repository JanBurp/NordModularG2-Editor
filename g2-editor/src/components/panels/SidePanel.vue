<template>
	<div class="w-68 bg-surface-1 border-l border-line-subtle flex flex-col">
		<div class="flex-1 overflow-hidden overflow-y-auto">
			<PatchBrowser ref="browserRef" v-show="settingsStore.rightPaneTab === 'browser'" :isActive="settingsStore.rightPaneTab === 'browser'" @select="patchFile.handlePatchSelect" />
			<ModulesPane ref="modulesPaneRef" v-show="settingsStore.rightPaneTab === 'modules'" :isActive="settingsStore.rightPaneTab === 'modules'" />
			<MidiCCPane v-show="settingsStore.rightPaneTab === 'midicc'" :isActive="settingsStore.rightPaneTab === 'midicc'" />
			<SettingsPane v-show="settingsStore.rightPaneTab === 'settings'" :isActive="settingsStore.rightPaneTab === 'settings'" />
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, onMounted, onUnmounted } from 'vue';
	import SettingsPane from './SettingsPane.vue';
	import ModulesPane from './ModulesPane.vue';
	import PatchBrowser from './PatchBrowser.vue';
	import MidiCCPane from './MidiCCPane.vue';
	import { useSettingsStore } from '@/store/settings';
	import { usePatchFile } from '@/composables/usePatchFile';

	const settingsStore = useSettingsStore();
	const patchFile = usePatchFile();

	const modulesPaneRef = ref<InstanceType<typeof ModulesPane> | null>(null);
	const browserRef = ref<InstanceType<typeof PatchBrowser> | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== '/') return;
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (!settingsStore.showRightPane) return;
		if (settingsStore.rightPaneTab === 'modules') {
			e.preventDefault();
			modulesPaneRef.value?.focusSearch();
		} else if (settingsStore.rightPaneTab === 'browser') {
			e.preventDefault();
			browserRef.value?.focusSearch();
		}
	}

	onMounted(() => window.addEventListener('keydown', handleKeydown));
	onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
