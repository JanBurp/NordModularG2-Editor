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
	import { paramControlRect, rectCenter } from '@/utils/hintPlacement';
	import { morphGroupName } from '@/store/slotHelpers';
	import { MORPH_NAMES } from '@/types/patch';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const { showMorphAssignOverlay } = useMorphAssignOverlay();
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	// Official HintViewParamMorphGroupes: a group in Knob mode shows its (custom) label, otherwise
	// its built-in source name.
	function groupName(g: number): string {
		const slot = uiStore.slotInFocus;
		const mode = slotsStore.getPatchParams(slot)?.[uiStore.variation]?.morphModes?.[g] ?? 0;
		return mode ? MORPH_NAMES[g] : morphGroupName(slotsStore.getPatchForSlot(slot), g);
	}

	const badges = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;
		const assignments = slotsStore.getMorphAssignments(slot, uiStore.variation).filter((a) => a.location === location);
		const result: { text: string; x: number; y: number; group: number }[] = [];
		for (const mod of props.modules) {
			const moduleDef = getModule(mod.type);
			if (!moduleDef?.params?.length) continue;
			for (let i = 0; i < moduleDef.params.length; i++) {
				const groups = assignments.filter((a) => a.moduleIndex === mod.index && a.paramIndex === i).map((a) => groupName(a.groupIndex));
				if (groups.length === 0) continue;
				result.push({
					text: groups.join(', '),
					...rectCenter(paramControlRect(mod, i, props.areaLabel)),
					group: mod.index,
				});
			}
		}
		return result;
	});
</script>
