<template>
	<div class="flex gap-1">
		<Button variant="default" size="small" :disabled="!canUndo" hint="undo" @click="undo()" :title="undoTitle">
			<Icon name="undo" class="w-3 h-3" />
		</Button>
		<Button variant="default" size="small" :disabled="!canRedo" hint="redo" @click="redo()" :title="redoTitle">
			<Icon name="redo" class="w-3 h-3" />
		</Button>
	</div>
</template>

<script setup lang="ts">
	import Button from './Button.vue';
	import Icon from '../common/Icon.vue';
	import { useUndoTarget } from '../../composables/useUndoTarget';

	// The Bank Organizer's history while it is open, else the focused slot's patch history.
	const { canUndo, canRedo, undoTitle, redoTitle, undo, redo } = useUndoTarget();
</script>
