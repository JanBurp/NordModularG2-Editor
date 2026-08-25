<template>
	<div class="flex gap-2">
		<Button variant="default" size="small" :disabled="!canUndo" @click="slotsStore.undo()" title="Undo (⌘Z)">
			<Icon name="undo" class="w-3.5 h-3.5" />
		</Button>
		<Button variant="default" size="small" :disabled="!canRedo" @click="slotsStore.redo()" title="Redo (⇧⌘Z)">
			<Icon name="redo" class="w-3.5 h-3.5" />
		</Button>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from './Button.vue';
	import Icon from '../common/Icon.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useHistoryStore } from '../../store/history';
	import { useUiStore } from '../../store/ui';

	const slotsStore = useSlotsStore();
	const historyStore = useHistoryStore();
	const uiStore = useUiStore();

	const canUndo = computed(() => historyStore.canUndo(uiStore.slotInFocus));
	const canRedo = computed(() => historyStore.canRedo(uiStore.slotInFocus));
</script>
