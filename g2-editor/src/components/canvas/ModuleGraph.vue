<template>
	<g class="graph">
		<rect :x="ve.x" :y="ve.y" :width="ve.w" :height="ve.h" :fill="ve.type === 'graphenv' ? colors.bgEnv : colors.bg" />

		<svg v-if="result" :x="(ve.x ?? 0) + 0.5" :y="ve.y" :width="ve.w" :height="ve.h">
			<template v-if="result.kind === 'path'">
				<line
					v-if="result.zeroLine"
					x1="0"
					:y1="(ve.h ?? 0) / 2"
					:x2="ve.w ?? 0"
					:y2="(ve.h ?? 0) / 2"
					:stroke="colors.zeroLine"
					:stroke-opacity="colors.zeroLineOpacity"
					stroke-width="0.5"
				/>
				<path v-if="result.dFill" :d="result.dFill" stroke="none" :fill="result.fill ?? 'none'" />
				<path v-if="result.d" :d="result.d" :transform="result.transform" :stroke="colors.curveStroke" :fill="result.dFill ? 'none' : pathFill" />
				<text v-if="result.label" :x="result.label.x" :y="result.label.y" :fill="colors.label" font-size="9" text-anchor="end">
					{{ result.label.text }}
				</text>
			</template>
			<template v-else-if="result.kind === 'dx'">
				<path :d="result.d" :stroke="colors.dxLine" fill="none" />
				<g v-for="node in result.nodes" :key="node.label" :transform="`translate(${node.x},${node.y})`">
					<rect width="18" height="11" :fill="colors.dxNodeBg" />
					<text x="6.5" y="9" :fill="colors.dxNodeText">{{ node.label }}</text>
				</g>
			</template>
		</svg>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';
	import { getGraph, GRAPH_COLORS } from './graphFunctions';

	const props = defineProps<{
		ve: VisualElement;
		lv?: number[];
		modes?: number[];
		moduleId?: number;
	}>();

	const colors = GRAPH_COLORS;

	const result = computed(() => getGraph(props.ve, props.lv, props.modes, props.moduleId));

	const pathFill = computed(() => {
		const r = result.value;
		if (!r || r.kind !== 'path') return 'none';
		if (r.fill) return r.fill;
		return props.ve.type === 'graphenv' ? colors.envFill : 'none';
	});
</script>
<style scoped>
	.graph {
		pointer-events: none;
	}
</style>
