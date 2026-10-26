<template>
	<ParamOverlay :items="badges" />
</template>

<script setup lang="ts">
	import { computed, inject, type Ref } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useUiStore } from '@/store/ui';
	import { canvasViewport, paramControlRect, paramHintCenter } from '@/utils/hintPlacement';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const uiStore = useUiStore();
	const svg = inject<Ref<SVGSVGElement | null>>('patchCanvasSvg');

	// Rendered once per canvas, after every module and every other overlay, so the live morph-range
	// drag hint always paints above other modules instead of being hidden behind whichever one
	// happens to sit below it in the DOM when the badge's clearance overflows the dragged module.
	const badges = computed(() => {
		const hint = uiStore.morphDragHint;
		if (!hint || hint.area !== props.areaLabel) return [];
		const mod = props.modules.find((m) => m.index === hint.moduleIndex);
		if (!mod) return [];
		if (!getModule(mod.type)?.params?.[hint.paramIndex]) return [];
		const at = paramHintCenter(paramControlRect(mod, hint.paramIndex, props.areaLabel), canvasViewport(svg?.value));
		return [{ text: hint.text, ...at }];
	});
</script>
