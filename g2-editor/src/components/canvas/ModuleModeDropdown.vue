<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-40" @click="emit('close')" @contextmenu.prevent="emit('close')" />

		<div
			ref="popupEl"
			data-testid="mode-dropdown"
			class="fixed z-50 bg-surface-2 shadow-lg flex flex-col"
			:style="{ left: adjustedX + 'px', top: adjustedY + 'px', transform: `scale(${zoom})`, transformOrigin: 'top left' }"
		>
			<svg v-for="i in optionCount" :key="i - 1" :width="rowWidth" :height="rowHeight" class="overflow-hidden! cursor-pointer" @click="onSelect(i - 1)">
				<rect x="0" y="0" :width="rowWidth" :height="rowHeight" :fill="i - 1 === value && !isGraph ? '#AAA' : '#CCC'" stroke="#333" />
				<ModuleGraph v-if="isGraph" :ve="graphVe" :lv="lv" :modes="[i - 1]" :module-id="moduleId" />
				<use v-else :href="`#${paramDef.img}`" :transform="`translate(0, ${(i - 1) * itemHeight})`" />
				<rect
					v-if="isGraph && i - 1 === value"
					x="0.75"
					y="0.75"
					:width="rowWidth - 1.5"
					:height="rowHeight - 1.5"
					fill="none"
					stroke="#FFF"
					stroke-width="1.5"
				/>
			</svg>
		</div>
	</Teleport>
</template>
<script setup lang="ts">
	import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
	import { useSettingsStore } from '../../store/settings';
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

	const popupEl = ref<HTMLElement | null>(null);
	const adjustedX = ref(props.x);
	const adjustedY = ref(props.y);

	async function clampToViewport() {
		await nextTick();
		if (!popupEl.value) return;
		// Measured post-scale (the popup is CSS-transform-scaled to match canvas zoom), so use the
		// rendered box, not clientWidth/clientHeight (which ignore transforms).
		const { width: w, height: h } = popupEl.value.getBoundingClientRect();
		adjustedX.value = Math.min(props.x, window.innerWidth - w - 4);
		adjustedY.value = props.y + h > window.innerHeight ? props.y - h : props.y;
	}

	watch(() => [props.x, props.y, props.paramDef, zoom.value], clampToViewport, { immediate: true });

	function onSelect(value: number) {
		emit('select', value);
		emit('close');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') emit('close');
	}

	onMounted(() => window.addEventListener('keydown', onKeydown));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
