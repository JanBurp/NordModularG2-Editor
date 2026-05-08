<template>
	<g class="graph">
		<rect :x="ve.x" :y="ve.y" :width="ve.w" :height="ve.h" :fill="ve.type === 'graphenv' ? '#00A4A4' : '#088'" />

		<svg v-if="result" :x="(ve.x ?? 0) + 0.5" :y="ve.y" :width="ve.w" :height="ve.h">
			<template v-if="result.kind === 'path'">
				<path :d="result.d" :transform="result.transform" stroke="#AFA" :fill="ve.type === 'graphenv' ? '#00A4A4' : 'none'" />
			</template>
			<template v-else-if="result.kind === 'dx'">
				<path :d="result.d" stroke="white" fill="none" />
				<g v-for="node in result.nodes" :key="node.label" :transform="`translate(${node.x},${node.y})`">
					<rect width="18" height="11" fill="white" />
					<text x="6.5" y="9" fill="#088">{{ node.label }}</text>
				</g>
			</template>
		</svg>
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import type { VisualElement } from '../../types';
	import { getGraph } from './graphFunctions';

	const props = defineProps<{
		ve: VisualElement;
		lv?: number[];
		modes?: number[];
	}>();

	const result = computed(() => getGraph(props.ve, props.lv, props.modes));
</script>
<style scoped>
	.graph {
		pointer-events: none;
	}
</style>
