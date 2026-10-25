<template>
	<div
		class="flex flex-col justify-between bg-surface-1 border border-line-default overflow-hidden"
		:class="large ? 'w-10 h-8' : 'w-7 h-5'"
		:data-percent="value.toFixed(1)"
	>
		<span class="text-content-secondary font-mono text-center" :class="large ? 'text-[10px]' : 'text-[7px]'">{{ value.toFixed(1) }}</span>
		<div class="w-full bg-surface-2 overflow-hidden" :class="large ? 'h-3' : 'h-2'">
			<div class="h-full" :class="value > 100 ? 'bg-red-500' : 'bg-green-500'" :style="{ width: Math.min(value, 100) + '%' }" />
		</div>
	</div>
</template>

<script setup lang="ts">
	defineProps<{
		value: number;
		large?: boolean;
	}>();
</script>
