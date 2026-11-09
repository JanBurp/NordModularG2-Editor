<template>
	<!-- Width is user-dragged (left-edge splitbar) and capped so the canvas keeps at least CANVAS_MIN_WIDTH;
	     @container: panes reflow on the panel's own width -->
	<div
		ref="panelRef"
		class="@container relative shrink-0 bg-surface-1 border-l border-line-subtle flex flex-col"
		:style="{
			width: settingsStore.rightPaneWidth[widthKind] + 'px',
			minWidth: MIN_PANE_WIDTH[widthKind] + 'px',
			maxWidth: `calc(100vw - ${CANVAS_MIN_WIDTH}px)`,
		}"
	>
		<div
			class="absolute inset-y-0 -left-1 w-2 z-10 cursor-col-resize hover:bg-accent/40"
			:class="{ 'bg-accent/40': isDragging }"
			title="Drag to resize, double-click to reset"
			data-testid="side-panel-splitbar"
			@mousedown.prevent="startResize"
			@dblclick="settingsStore.setRightPaneWidth(widthKind, DEFAULT_PANE_WIDTH[widthKind])"
		/>
		<div class="flex-1 overflow-hidden overflow-y-auto">
			<PatchBrowser
				ref="browserRef"
				v-show="settingsStore.rightPaneTab === 'browser'"
				:isActive="settingsStore.rightPaneTab === 'browser'"
				@select="patchFile.handlePatchSelect"
			/>
			<ModulesPane ref="modulesPaneRef" v-show="settingsStore.rightPaneTab === 'modules'" :isActive="settingsStore.rightPaneTab === 'modules'" />
			<LibraryPane ref="libraryPaneRef" v-show="settingsStore.rightPaneTab === 'library'" :isActive="settingsStore.rightPaneTab === 'library'" />
			<MidiCCPane v-show="settingsStore.rightPaneTab === 'midicc'" :isActive="settingsStore.rightPaneTab === 'midicc'" />
			<ParamOverviewPane v-show="settingsStore.rightPaneTab === 'overview'" />
			<PatchMutatorPane v-show="settingsStore.rightPaneTab === 'mutator'" />
			<TextPane v-show="settingsStore.rightPaneTab === 'text'" />
			<SettingsPane v-show="settingsStore.rightPaneTab === 'settings'" :isActive="settingsStore.rightPaneTab === 'settings'" />
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, onUnmounted } from 'vue';
	import SettingsPane from './SettingsPane.vue';
	import ModulesPane from './ModulesPane.vue';
	import LibraryPane from './LibraryPane.vue';
	import PatchBrowser from './PatchBrowser.vue';
	import MidiCCPane from './MidiCCPane.vue';
	import ParamOverviewPane from './ParamOverviewPane.vue';
	import PatchMutatorPane from './PatchMutatorPane.vue';
	import TextPane from './TextPane.vue';
	import { useSettingsStore, DEFAULT_PANE_WIDTH, MIN_PANE_WIDTH, type PaneWidthKind } from '@/store/settings';
	import { usePatchFile } from '@/composables/usePatchFile';
	import { useDragInteraction } from '@/composables/useDragInteraction';

	const settingsStore = useSettingsStore();
	const patchFile = usePatchFile();

	const CANVAS_MIN_WIDTH = 240;

	// Overview and Mutator remember their own (wider) width
	const widthKind = computed<PaneWidthKind>(() => (['overview', 'mutator'].includes(settingsStore.rightPaneTab) ? 'wide' : 'narrow'));

	// Drag from the rendered width (it may be capped by max-w), panel grows to the left
	const panelRef = ref<HTMLElement | null>(null);
	let startWidth = 0;
	const { isDragging, onMouseDown } = useDragInteraction((dx) =>
		settingsStore.setRightPaneWidth(widthKind.value, Math.min(startWidth - dx, window.innerWidth - CANVAS_MIN_WIDTH)),
	);
	function startResize(e: MouseEvent) {
		startWidth = panelRef.value?.offsetWidth ?? settingsStore.rightPaneWidth[widthKind.value];
		onMouseDown(e);
	}

	const modulesPaneRef = ref<InstanceType<typeof ModulesPane> | null>(null);
	const browserRef = ref<InstanceType<typeof PatchBrowser> | null>(null);
	const libraryPaneRef = ref<InstanceType<typeof LibraryPane> | null>(null);

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
		} else if (settingsStore.rightPaneTab === 'library') {
			e.preventDefault();
			libraryPaneRef.value?.focusSearch();
		}
	}

	onMounted(() => window.addEventListener('keydown', handleKeydown));
	onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
