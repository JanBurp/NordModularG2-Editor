<template>
	<div
		class="aspect-square rounded-xs border-2 overflow-hidden"
		:style="{ background: genome ? colors.bg : GRAPH_COLORS.areaFill, borderColor: focused ? GRAPH_COLORS.curveStroke : 'transparent' }"
		:draggable="genome !== null"
	>
		<svg v-if="genome" :viewBox="`0 0 ${SIZE} ${SIZE}`" class="w-full h-full block">
			<polyline data-testid="muta-chromosome" :points="points" fill="none" :stroke="colors.line" stroke-width="1" stroke-linejoin="round" />
		</svg>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { GRAPH_COLORS } from '../canvas/graphFunctions';
	import { chromosomePath, type Genome } from '../../renderer/mutator';

	const props = defineProps<{
		genome: Genome | null;
		family?: boolean; // Mother / Father / children: drawn in the parent-family colours
		focused?: boolean;
	}>();

	const SIZE = 40; // official 40×40 bitmap

	const colors = computed(() =>
		props.family ? { bg: GRAPH_COLORS.areaFill, line: GRAPH_COLORS.label } : { bg: GRAPH_COLORS.bg, line: GRAPH_COLORS.curveStroke },
	);

	// DrawChromosome: fit the turtle walk's bounding box into 90% of the box, centred.
	const points = computed(() => {
		if (!props.genome) return '';
		const pts = chromosomePath(props.genome);
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
		const scale = 0.9 * Math.min(SIZE / (maxX - minX || 1), SIZE / (maxY - minY || 1));
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		return pts.map(([x, y]) => `${(SIZE / 2 + (x - cx) * scale).toFixed(1)},${(SIZE / 2 + (y - cy) * scale).toFixed(1)}`).join(' ');
	});
</script>
