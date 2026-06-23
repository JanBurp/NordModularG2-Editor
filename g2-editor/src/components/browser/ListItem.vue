<template>
	<li :class="['flex items-center gap-2 py-1.5 px-3 cursor-pointer hover:bg-surface-2 transition-colors', selected ? 'bg-surface-3 ring-1 ring-inset ring-accent-primary' : '']" @click="$emit('click')">
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
	defineProps<{ selected?: boolean }>();
	defineEmits(['click']);
</script>
