<template>
	<div class="h-8 flex gap-1 bg-neutral-700 rounded px-2 items-center">
		<span class="w-4 text-xs text-neutral-400">VA</span>
		<CPUpart :value="va.cycles" />
		<CPUpart :value="va.memory" />
		<span class="w-4 text-xs text-neutral-400">FX</span>
		<CPUpart :value="fx.cycles" />
		<CPUpart :value="fx.memory" />
	</div>
</template>

<script setup lang="ts">
	import CPUpart from './CPUpart.vue';

	defineProps<{
		va: { cycles: number; memory: number };
		fx: { cycles: number; memory: number };
	}>();
</script>
