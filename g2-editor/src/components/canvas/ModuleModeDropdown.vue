<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-40" @click="emit('close')" @contextmenu.prevent="emit('close')" />

		<div
			ref="popupEl"
			data-testid="mode-dropdown"
			role="listbox"
			class="fixed z-50 bg-surface-2 shadow-lg flex flex-col"
			:style="{ left: adjustedX + 'px', top: adjustedY + 'px', transform: `scale(${zoom})`, transformOrigin: 'top left' }"
		>
			<svg
				v-for="i in optionCount"
				:key="i - 1"
				:width="rowWidth"
				:height="rowHeight"
				class="overflow-hidden! cursor-pointer"
				role="option"
				tabindex="-1"
				:aria-selected="i - 1 === value"
				@click="onSelect(i - 1)"
			>
				<rect x="0" y="0" :width="rowWidth" :height="rowHeight" :fill="i - 1 === value && !isGraph ? '#AAA' : '#CCC'" stroke="#333" />
				<ModuleGraph v-if="isGraph" :ve="graphVe" :lv="lv" :modes="[i - 1]" :module-id="moduleId" />
				<use v-else :href="`#${paramDef.img}`" :transform="`translate(${imgShift[0]}, ${(i - 1) * itemHeight + imgShift[1]})`" />
				<!-- The graph paints its own background, so darken the selected graph with an overlay instead -->
				<rect
					v-if="isGraph && i - 1 === value"
					x="0"
					y="0"
					:width="rowWidth"
					:height="rowHeight"
					fill="#000"
					fill-opacity="0.25"
					pointer-events="none"
				/>
			</svg>
		</div>
	</Teleport>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { useSettingsStore } from '../../store/settings';
	import { useViewportClampedPopup } from '../../composables/useViewportClampedPopup';
	import ModuleGraph from './ModuleGraph.vue';
	import type { ParamDefinition } from '../../types';

	const props = defineProps<{
		paramDef: ParamDefinition;
		value: number;
		x: number;
		y: number;
		moduleId?: number;
		lv?: number[];
	}>();

	const emit = defineEmits<{
		select: [value: number];
		close: [];
	}>();

	const settingsStore = useSettingsStore();
	const zoom = computed(() => settingsStore.canvasZoom);

	const itemHeight = computed(() => props.paramDef.h || -18);
	const imgShift = computed(() => props.paramDef.imgShift ?? [0, 0]);
	const optionCount = computed(() => props.paramDef.high - props.paramDef.low + 1);
	const isGraph = computed(() => !!props.paramDef.graph);

	// Graph rows aren't constrained by the module's panel layout the way the closed control is,
	// so they use a fixed, more legible size instead of the (deliberately compact) paramDef size.
	const GRAPH_ROW_SIZE = { width: 32, height: 32 };
	const rowWidth = computed(() => (isGraph.value ? GRAPH_ROW_SIZE.width : props.paramDef.width || 18));
	const rowHeight = computed(() => (isGraph.value ? GRAPH_ROW_SIZE.height : props.paramDef.height || 21));
	const graphVe = computed(() => ({
		type: 'graph',
		x: 0,
		y: 0,
		w: rowWidth.value,
		h: rowHeight.value,
		f: typeof props.paramDef.graph === 'string' ? props.paramDef.graph : undefined,
	}));

	const { popupEl, adjustedX, adjustedY } = useViewportClampedPopup(
		() => props.x,
		() => props.y,
		() => zoom.value,
		() => emit('close'),
		[() => props.paramDef],
	);

	function onSelect(value: number) {
		emit('select', value);
		emit('close');
	}
</script>
<style scoped>
	/* No browser focus outline (the selected row gets focus on open); keyboard-focused rows darken like the selected one */
	[role='option']:focus {
		outline: none;
	}
	[role='option']:focus-visible:not([aria-selected='true']) {
		filter: brightness(0.85);
	}
</style>
