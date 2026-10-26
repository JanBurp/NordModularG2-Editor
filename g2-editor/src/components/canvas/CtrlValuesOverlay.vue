<template>
	<ParamOverlay v-if="showCtrlValuesOverlay" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { getParam } from '@/renderer/parammap';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useMidiCCOverlay } from '@/composables/useMidiCC';
	import { paramControlRects, rectCenter } from '@/utils/hintPlacement';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	// Official Ctrl+F8 (HintViewParamControllerValue): every param shows its value as a MIDI
	// controller value, (value << 7) / (max + 1).
	const { showCtrlValuesOverlay } = useMidiCCOverlay();
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const badges = computed(() => {
		const areaKey = props.areaLabel === 'va' ? 'voice' : 'fx';
		const result: { text: string; x: number; y: number; group: number }[] = [];
		const controlRect = paramControlRects(props.areaLabel);
		for (const mod of props.modules) {
			const values = slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.[areaKey]?.[mod.index] ?? [];
			(getModule(mod.type)?.params ?? []).forEach((param, i) => {
				const max = getParam(param.type)?.high;
				if (!param.n || max === undefined) return;
				result.push({
					text: String(Math.floor(((values[i] ?? 0) << 7) / (max + 1))),
					...rectCenter(controlRect(mod, i)),
					group: mod.index,
				});
			});
		}
		return result;
	});
</script>
