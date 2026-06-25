<template>
	<li
		:class="[
			'flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-surface-2 transition-colors',
			selected ? 'bg-surface-3 ring-1 ring-inset ring-accent-primary' : '',
		]"
		@click="$emit('click')"
	>
		<div class="shrink-0 w-8 text-content-secondary text-xs">
			<slot name="icon"></slot>
		</div>
		<div class="truncate flex-1 text-sm">
			<slot name="label" />
		</div>
		<div class="text-content-secondary text-xs">
			<slot name="meta"></slot>
		</div>
	</li>
</template>

<script setup lang="ts">
	defineProps<{ selected?: boolean }>();
	defineEmits(['click']);
</script>
