<template>
	<ParamOverlay v-if="showMorphAssignOverlay" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useMorphAssignOverlay } from '@/composables/useMorphAssign';
	import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants/ui';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const { showMorphAssignOverlay } = useMorphAssignOverlay();
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const badges = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;
		const assignments = slotsStore.getMorphAssignments(slot, uiStore.variation).filter((a) => a.location === location);
		const result: { text: string; x: number; y: number }[] = [];
		for (const mod of props.modules) {
			const moduleDef = getModule(mod.type);
			if (!moduleDef?.params?.length) continue;
			for (let i = 0; i < moduleDef.params.length; i++) {
				const groups = assignments.filter((a) => a.moduleIndex === mod.index && a.paramIndex === i).map((a) => a.groupIndex + 1);
				if (groups.length === 0) continue;
				const param = moduleDef.params[i];
				result.push({
					text: `M${groups.join(',')}`,
					x: (mod.horiz ?? 0) * MODULE_WIDTH + param.x,
					y: (mod.vert ?? 0) * MODULE_ROW_HEIGHT + param.y,
				});
			}
		}
		return result;
	});
</script>
