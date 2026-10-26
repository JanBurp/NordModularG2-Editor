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
	import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants/ui';
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
		const moduleDef = mod && getModule(mod.type);
		if (!mod || !moduleDef) return [];
		// Module name (CPanel::ShowModuleNameHint): the long name, centred 45 px right and 6 px below
		// the module's top-left (past the official 11 px replace button, half the 64 px name bar, + 2).
		if (hint.paramIndex < 0) return [{ text: moduleDef.long, x: (mod.horiz ?? 0) * MODULE_WIDTH + 45, y: (mod.vert ?? 0) * MODULE_ROW_HEIGHT + 6 }];
		if (!moduleDef.params?.[hint.paramIndex]?.n) return [];
		const at = paramHintCenter(paramControlRect(mod, hint.paramIndex, props.areaLabel), canvasViewport(svg?.value));
		return [{ text: paramHintText(mod, hint.paramIndex, props.areaLabel), ...at }];
	});
</script>
