<template>
	<ParamOverlay v-if="uiStore.morphValuesGroup !== null" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { formatMorphValues } from '@/utils/moduleControls';
	import { paramControlRect, rectCenter } from '@/utils/hintPlacement';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	// Official HintViewParamMorphValues: while a toolbar morph knob is held, every param morphed in
	// that group (focused variation) shows its morph start -- end.
	const badges = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;
		const groupIndex = uiStore.morphValuesGroup;
		const areaKey = props.areaLabel === 'va' ? 'voice' : 'fx';
		const result: { text: string; x: number; y: number; group: number }[] = [];
		for (const a of slotsStore.getMorphAssignments(slot, uiStore.variation)) {
			if (a.location !== location || a.groupIndex !== groupIndex) continue;
			const mod = props.modules.find((m) => m.index === a.moduleIndex);
			if (!mod) continue;
			const moduleDef = getModule(mod.type);
			if (!moduleDef?.params?.[a.paramIndex]) continue;
			const values = slotsStore.slots[slot]?.variations?.[uiStore.variation]?.[areaKey]?.[mod.index] ?? [];
			result.push({
				text: formatMorphValues(moduleDef, a.paramIndex, values, mod.modes, a.range),
				...rectCenter(paramControlRect(mod, a.paramIndex, props.areaLabel)),
				group: mod.index,
			});
		}
		return result;
	});
</script>
