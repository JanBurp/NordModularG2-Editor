<template>
	<ParamOverlay :items="badges" />
</template>

<script setup lang="ts">
	import { computed, inject, type Ref } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useUiStore } from '@/store/ui';
	import { useKeyHoldOverlay } from '@/composables/useKeyHoldOverlay';
	import { paramHintText } from '@/composables/useValueHint';
	import { canvasViewport, paramControlRect, paramHintCenter } from '@/utils/hintPlacement';
	import ParamOverlay from './ParamOverlay.vue';

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const uiStore = useUiStore();
	const svg = inject<Ref<SVGSVGElement | null>>('patchCanvasSvg');
	const { isVisible: allValuesShown } = useKeyHoldOverlay('F5');

	// Canvas-level like MorphDragHintOverlay, so the hint paints above every module. The text is
	// computed live, so it follows drags and hardware echoes while shown.
	const badges = computed(() => {
		const hint = uiStore.valueHint;
		if (!hint || hint.area !== props.areaLabel || uiStore.morphDragHint || allValuesShown.value) return [];
		const mod = props.modules.find((m) => m.index === hint.moduleIndex);
		if (!mod?.type || !getModule(mod.type)?.params?.[hint.paramIndex]?.n) return [];
		const at = paramHintCenter(paramControlRect(mod, hint.paramIndex, props.areaLabel), canvasViewport(svg?.value));
		return [{ text: paramHintText(mod, hint.paramIndex, props.areaLabel), ...at }];
	});
</script>
