<template>
	<div class="bg-surface-2 rounded px-2 flex" :class="mini ? 'h-6 gap-3 items-center' : 'h-full py-1 flex-col justify-around'">
		<div class="flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">VA</span>
			<CPUpart :value="va.cycles" :large="!mini" />
			<CPUpart :value="va.memory" :large="!mini" />
			<span v-if="!compact && !mini" class="text-[10px] text-content-muted ml-1 whitespace-nowrap" data-testid="area-counts-va"
				>{{ va.modules }}m/{{ va.cables }}c</span
			>
		</div>
		<div class="flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">FX</span>
			<CPUpart :value="fx.cycles" :large="!mini" />
			<CPUpart :value="fx.memory" :large="!mini" />
			<span v-if="!compact && !mini" class="text-[10px] text-content-muted ml-1 whitespace-nowrap" data-testid="area-counts-fx"
				>{{ fx.modules }}m/{{ fx.cables }}c</span
			>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import CPUpart from './CPUpart.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { areaConfig } from '../../store/slotHelpers';

	withDefaults(defineProps<{ compact?: boolean; mini?: boolean }>(), { compact: false, mini: false });

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	function areaCount(area: 'voice' | 'fx', type: 'modules' | 'cables'): number {
		const i = areaConfig(area).areaIdx;
		return type === 'modules' ? (currentPatch.value?.areas?.[i]?.modules?.length ?? 0) : (currentPatch.value?.areas?.[i]?.cableList?.length ?? 0);
	}

	const va = computed(() => ({
		...slotsStore.activeSlotResources.va,
		modules: areaCount('voice', 'modules'),
		cables: areaCount('voice', 'cables'),
	}));
	const fx = computed(() => ({
		...slotsStore.activeSlotResources.fx,
		modules: areaCount('fx', 'modules'),
		cables: areaCount('fx', 'cables'),
	}));
</script>
