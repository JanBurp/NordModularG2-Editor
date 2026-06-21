<template>
	<li
		class="flex items-center gap-2 py-1.5 px-3 cursor-pointer hover:bg-surface-2 transition-colors"
		@click="$emit('click')"
	>
		<slot name="icon">
			<span class="shrink-0 w-3" />
		</slot>
		<span class="truncate flex-1">
			<slot name="label" />
		</span>
		<slot name="meta" />
	</li>
</template>

<script setup lang="ts">
	defineEmits(['click']);
</script>