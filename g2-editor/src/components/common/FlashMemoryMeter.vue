<template>
	<!-- G2 flash memory used, red above 90 % (the official editor's Synth Settings shows it as free %) -->
	<div
		v-if="used !== null"
		class="flex flex-1 min-w-0 items-center gap-1.5 text-xs"
		:title="`Flash memory: ${used.toFixed(1)}% used, ${(100 - used).toFixed(1)}% free`"
		data-testid="flash-memory-meter"
	>
		<span v-if="label" class="text-content-secondary">Memory</span>
		<div class="flex-1 min-w-8 h-2 bg-surface-2 border border-line-default rounded-xs overflow-hidden">
			<div class="h-full" :class="used > 90 ? 'bg-red-500' : 'bg-green-500'" :style="{ width: `${used}%` }" />
		</div>
		<span class="font-mono text-content-secondary">{{ used.toFixed(1) }}%</span>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { useBrowserStore } from '@/store/browser';

	withDefaults(defineProps<{ label?: boolean }>(), { label: true });

	const browser = useBrowserStore();
	const used = computed(() => browser.flashUsedPercent);
</script>
