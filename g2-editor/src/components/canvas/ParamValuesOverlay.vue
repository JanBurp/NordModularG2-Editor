<template>
	<ParamOverlay v-if="isVisible" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useKeyHoldOverlay } from '@/composables/useKeyHoldOverlay';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const { isVisible } = useKeyHoldOverlay('F5');
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const badges = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		const areaKey = props.areaLabel === 'va' ? 'voice' : 'fx';
		const variation = uiStore.variation;
		const result: { text: string; x: number; y: number; color: string }[] = [];
		for (const mod of props.modules) {
			const moduleDef = getModule(mod.type);
			if (!moduleDef?.params?.length) continue;
			const values: number[] = slotsStore.slots[slot]?.variations?.[variation]?.[areaKey]?.[mod.index] ?? [];
			for (let i = 0; i < moduleDef.params.length; i++) {
				const param = moduleDef.params[i];
				const value = values[i] ?? 0;
				result.push({
					text: String(value),
					x: (mod.horiz ?? 0) * 256 + param.x,
					y: (mod.vert ?? 0) * 16 + param.y,
					color: '#5CF',
				});
			}
		}
		return result;
	});
</script>
