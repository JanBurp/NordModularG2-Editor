<template>
	<ParamOverlay :items="badges" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useUiStore } from '@/store/ui';
	import { isSlider } from '@/utils/moduleControls';
	import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants/ui';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const uiStore = useUiStore();

	// Rendered once per canvas, after every module and every other overlay, so the live morph-range
	// drag hint always paints above other modules instead of being hidden behind whichever one
	// happens to sit below it in the DOM when the badge's clearance overflows the dragged module.
	const badges = computed(() => {
		const hint = uiStore.morphDragHint;
		if (!hint || hint.area !== props.areaLabel) return [];
		const mod = props.modules.find((m) => m.index === hint.moduleIndex);
		if (!mod) return [];
		const param = getModule(mod.type)?.params?.[hint.paramIndex];
		if (!param) return [];
		// Enough clearance below the control so the badge doesn't sit on top of it.
		const yOffset = isSlider(param.n) ? 70 : 34;
		return [
			{
				text: hint.text,
				x: (mod.horiz ?? 0) * MODULE_WIDTH + param.x,
				y: (mod.vert ?? 0) * MODULE_ROW_HEIGHT + param.y + yOffset,
			},
		];
	});
</script>
