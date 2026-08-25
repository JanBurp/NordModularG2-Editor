<template>
	<div class="bg-surface-2 rounded px-2 py-1 flex flex-col gap-2">
		<div class="h-6 flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">VA</span>
			<CPUpart :value="va.cycles" />
			<CPUpart :value="va.memory" />
		</div>
		<div class="h-6 flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">FX</span>
			<CPUpart :value="fx.cycles" />
			<CPUpart :value="fx.memory" />
		</div>
	</div>
</template>

<script setup lang="ts">
	import CPUpart from './CPUpart.vue';

	defineProps<{
		va: { cycles: number; memory: number };
		fx: { cycles: number; memory: number };
	}>();
</script>
