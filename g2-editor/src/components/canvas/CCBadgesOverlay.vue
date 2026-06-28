<template>
	<ParamOverlay v-if="showCCOverlay" :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useMidiCCOverlay } from '@/composables/useMidiCC';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const { showCCOverlay } = useMidiCCOverlay();
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const badges = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;
		const result: { text: string; x: number; y: number }[] = [];
		for (const c of slotsStore.slots[slot].controllers) {
			if (c.location !== location) continue;
			const mod = props.modules.find((m) => m.index === c.moduleIndex);
			if (!mod) continue;
			const param = getModule(mod.type)?.params?.[c.paramIndex];
			if (!param) continue;
			result.push({
				text: `CC# ${c.cc}`,
				x: (mod.horiz ?? 0) * 256 + param.x,
				y: (mod.vert ?? 0) * 16 + param.y,
			});
		}
		return result;
	});
</script>
