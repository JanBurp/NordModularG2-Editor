<template>
	<ParamOverlay v-if="isVisible" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useKeyHoldOverlay } from '@/composables/useKeyHoldOverlay';
	import { paramHintText } from '@/composables/useValueHint';
	import { paramControlRect, rectCenter } from '@/utils/hintPlacement';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const { isVisible } = useKeyHoldOverlay('F5');

	const badges = computed(() => {
		const result: { text: string; x: number; y: number; group: number }[] = [];
		for (const mod of props.modules) {
			const params = getModule(mod.type)?.params ?? [];
			params.forEach((param, i) => {
				if (!param.n) return;
				result.push({ text: paramHintText(mod, i, props.areaLabel), ...rectCenter(paramControlRect(mod, i, props.areaLabel)), group: mod.index });
			});
		}
		return result;
	});
</script>
