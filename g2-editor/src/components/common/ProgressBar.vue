<template>
	<!-- Status line, bar, optional detail line (bank upload/download, Bank Organizer) -->
	<div class="space-y-1">
		<div class="text-orange-400 text-sm">{{ text }}</div>
		<div class="h-1.5 w-full bg-surface-2 rounded overflow-hidden">
			<div class="h-full bg-orange-400 transition-all" :style="{ width: max ? `${(value / max) * 100}%` : '0%' }"></div>
		</div>
		<div v-if="detail" class="text-xs text-content-secondary truncate">{{ detail }}</div>
	</div>
</template>

<script setup lang="ts">
	defineProps<{ text: string; value: number; max: number; detail?: string }>();
</script>
