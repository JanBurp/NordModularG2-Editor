<template>
	<!-- Patch window split bar (manual: "Patch window split bar"): drag to resize, buttons switch the area -->
	<div class="flex shrink-0 items-center h-2.5 bg-surface-1 border-y border-line-subtle cursor-row-resize select-none" @mousedown="emit('dragStart', $event)">
		<button
			v-for="btn in BUTTONS"
			:key="btn.mode"
			class="flex items-center justify-center w-3 h-full border-r border-line-default text-content-secondary hover:text-content-primary hover:bg-surface-3 cursor-pointer"
			:title="btn.title"
			@mousedown.stop
			@click="uiStore.setAreaMode(btn.mode)"
		>
			<Icon :name="btn.icon" class="w-2 h-2" />
		</button>
	</div>
</template>

<script setup lang="ts">
	import Icon from '../common/Icon.vue';
	import { useUiStore } from '../../store/ui';

	const emit = defineEmits<{ dragStart: [e: MouseEvent] }>();
	const uiStore = useUiStore();

	// Split restores the previous split position (setAreaMode keeps it in patch.splitHeight).
	const BUTTONS = [
		{ mode: 1, icon: 'triangleUp', title: 'Show only the Voice Area' },
		{ mode: 0, icon: 'triangleDown', title: 'Show only the FX Area' },
		{ mode: 2, icon: 'splitRestore', title: 'Back to the previous split position' },
	] as const;
</script>
