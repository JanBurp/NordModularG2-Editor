<template>
	<ParamOverlay v-if="isVisible" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useKeyHoldOverlay } from '@/composables/useKeyHoldOverlay';
	import { slotIndexToBankPageKnob } from '@/renderer/paramPages';
	import { meterRect, paramControlRect, rectCenter } from '@/utils/hintPlacement';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	// Official F7 (HintViewKnobAssignment): each param (or level meter) on a Parameter Pages knob
	// shows page letter + column, then the knob, e.g. "A1:3".
	const { isVisible } = useKeyHoldOverlay('F7');
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const badges = computed(() => {
		const location = props.areaLabel === 'va' ? 1 : 0;
		const result: { text: string; x: number; y: number; group: number }[] = [];
		for (const k of slotsStore.slots[uiStore.slotInFocus]?.paramPages ?? []) {
			if (k.location !== location) continue;
			const mod = props.modules.find((m) => m.index === k.moduleIndex);
			if (!mod) continue;
			// A level-meter assignment (isLed) points at the module's meter, paramIndex = its LED number.
			const rect = k.isLed ? meterRect(mod, k.paramIndex) : paramControlRect(mod, k.paramIndex, props.areaLabel);
			if (!rect) continue;
			const { page, bank, knob } = slotIndexToBankPageKnob(k.slotIndex);
			result.push({ text: `${'ABCDE'[page]}${bank + 1}:${knob + 1}`, ...rectCenter(rect), group: mod.index });
		}
		return result;
	});
</script>
