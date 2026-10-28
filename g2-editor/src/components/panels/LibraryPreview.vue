<template>
	<svg :viewBox="`0 0 ${width} ${height}`" class="w-full h-auto block" font-size="9" xmlns="http://www.w3.org/2000/svg">
		<!-- index 0, as in the Modules pane: an item's indices would pick up the open patch's selection and values -->
		<Module v-for="m in modules" :key="m.index" :instance="{ ...m, index: 0 }" />
		<g ref="cableLayer" />
	</svg>
</template>

<script setup lang="ts">
	import { computed, onMounted, ref, watch } from 'vue';
	import type { ClipboardEntry } from '@/types/patch';
	import Module from '../canvas/Module.vue';
	import { MODULE_ROW_HEIGHT, MODULE_WIDTH } from '@/constants';
	import { getModule } from '../../renderer/nmg2mods';
	import { makePatchCables } from '../../renderer/cableRenderer';
	import { useSettingsStore } from '@/store/settings';

	const props = defineProps<{ entry: ClipboardEntry }>();
	const settings = useSettingsStore();
	const cableLayer = ref<SVGGElement | null>(null);

	// Moved to the top-left: a whole patch file's modules needn't start there.
	const modules = computed(() => {
		const minCol = Math.min(...props.entry.modules.map((m) => m.horiz));
		const minRow = Math.min(...props.entry.modules.map((m) => m.vert));
		return props.entry.modules.map((m) => ({ ...m, horiz: m.horiz - minCol, vert: m.vert - minRow }));
	});
	const width = computed(() => (Math.max(...modules.value.map((m) => m.horiz)) + 1) * MODULE_WIDTH);
	const height = computed(() => Math.max(...modules.value.map((m) => m.vert + (getModule(m.type)?.height ?? 2))) * MODULE_ROW_HEIGHT);

	function drawCables(): void {
		if (!cableLayer.value) return;
		cableLayer.value.replaceChildren();
		makePatchCables(modules.value, props.entry.cables, cableLayer.value, {
			gravity: settings.cableGravity,
			opacity: settings.cableOpacity,
			thickness: settings.cableThickness,
		});
	}

	onMounted(drawCables);
	watch(() => props.entry, drawCables);
</script>

<style scoped>
	/* A picture only: clicks, drags and right-clicks go to the Library item, not to the modules' own controls. */
	svg :deep(*) {
		pointer-events: none !important;
	}
</style>
