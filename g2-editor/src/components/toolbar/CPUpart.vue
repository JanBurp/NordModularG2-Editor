<template>
	<div class="w-5 h-5 flex flex-col justify-between bg-neutral-800 border border-neutral-600 overflow-hidden">
		<span class="text-[7px] text-neutral-300 font-mono text-center">{{ value.toFixed(1) }}</span>
		<div class="w-full h-2 bg-neutral-700 overflow-hidden">
			<div class="h-full" :class="value >= 100 ? 'bg-red-500' : 'bg-green-500'" :style="{ width: Math.min(value, 100) + '%' }" />
		</div>
	</div>
</template>

<script setup lang="ts">
	defineProps<{
		value: number;
	}>();
</script>
