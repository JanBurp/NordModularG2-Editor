<template>
	<div class="bg-surface-2 rounded px-2 py-1 flex flex-col gap-2">
		<div class="h-6 flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">VA</span>
			<CPUpart :value="va.cycles" />
			<CPUpart :value="va.memory" />
			<span v-if="!compact" class="text-[10px] text-content-muted ml-1 whitespace-nowrap" data-testid="area-counts-va"
				>{{ va.modules }}m/{{ va.cables }}c</span
			>
		</div>
		<div class="h-6 flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">FX</span>
			<CPUpart :value="fx.cycles" />
			<CPUpart :value="fx.memory" />
			<span v-if="!compact" class="text-[10px] text-content-muted ml-1 whitespace-nowrap" data-testid="area-counts-fx"
				>{{ fx.modules }}m/{{ fx.cables }}c</span
			>
		</div>
	</div>
</template>

<script setup lang="ts">
	import CPUpart from './CPUpart.vue';

	withDefaults(
		defineProps<{
			va: { cycles: number; memory: number; modules: number; cables: number };
			fx: { cycles: number; memory: number; modules: number; cables: number };
			compact?: boolean;
		}>(),
		{ compact: false },
	);
</script>
