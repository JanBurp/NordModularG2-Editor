<template>
	<ParamOverlay v-if="showMorphRangeOverlay" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useMorphRangeOverlay } from '@/composables/useMorphAssign';
	import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants/ui';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const { showMorphRangeOverlay } = useMorphRangeOverlay();
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	// Only the currently selected group's range is shown, to avoid clutter from a param assigned
	// to several groups at once.
	const badges = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;
		const groupIndex = uiStore.selectedMorphGroup;
		const result: { text: string; x: number; y: number }[] = [];
		for (const a of slotsStore.getMorphAssignments(slot, uiStore.variation)) {
			if (a.location !== location || a.groupIndex !== groupIndex) continue;
			const mod = props.modules.find((m) => m.index === a.moduleIndex);
			if (!mod) continue;
			const param = getModule(mod.type)?.params?.[a.paramIndex];
			if (!param) continue;
			result.push({
				text: a.range >= 0 ? `+${a.range}` : `${a.range}`,
				x: (mod.horiz ?? 0) * MODULE_WIDTH + param.x,
				y: (mod.vert ?? 0) * MODULE_ROW_HEIGHT + param.y,
			});
		}
		return result;
	});
</script>
