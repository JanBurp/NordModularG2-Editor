<template>
	<!-- ╭──── title ────╮ : groups the boxes below it (official Patch Mutator floater) -->
	<div class="flex items-start gap-2 font-bold">
		<span class="flex-1 h-2 mt-2 border-t border-l border-content-secondary" />
		<span>{{ title }}</span>
		<span class="flex-1 h-2 mt-2 border-t border-r border-content-secondary" />
	</div>
</template>

<script setup lang="ts">
	defineProps<{ title: string }>();
</script>
