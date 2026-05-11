<template>
	<g class="jack-group" :class="type" @mousedown.stop="onMousedown" @mouseup.stop="onMouseup">
		<!-- Larger hit area for easier clicking/dragging -->
		<circle v-if="type === 'input'" :cx="x" :cy="y" r="10" fill="none" style="pointer-events: all" />
		<rect v-else :x="x - 10" :y="y - 10" width="20" height="20" rx="1" fill="none" style="pointer-events: all" />
		<template v-if="type == 'input'">
			<circle :cx="x" :cy="y" r="5.5" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<circle :cx="x" :cy="y" r="2.5" :fill="connected ? jackColor : '#000'" stroke="#333" stroke-width="1" class="jack" />
		</template>
		<template v-else>
			<rect :x="x - 5.5" :y="y - 5.5" width="11" height="11" rx="1" ry="1" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<rect :x="x - 2.5" :y="y - 2.5" width="5" height="5" rx="1" ry="1" :fill="connected ? jackColor : '#000'" stroke="#333" stroke-width="1" class="jack" />
		</template>
		<!-- <text
			:x="labelX"
			:y="y + 3"
			fill="#000"
			font-size="8"
			:text-anchor="type === 'input' ? 'start' : 'end'"
		>
			{{ name }}
		</text> -->
	</g>
</template>
<script setup lang="ts">
	import { JACK_COLORS } from '../../constants';

	const props = defineProps<{
		name: string;
		colour: string;
		x: number;
		y: number;
		type: 'input' | 'output';
		moduleIndex: number;
		connectorIndex: number;
		connected?: boolean;
	}>();

	const emit = defineEmits<{
		jackDragStart: [
			info: {
				moduleIndex: number;
				connectorIndex: number;
				type: 'input' | 'output';
				colour: string;
			},
		];
		jackDragEnd: [
			info: {
				moduleIndex: number;
				connectorIndex: number;
				type: 'input' | 'output';
				colour: string;
			},
		];
	}>();

	const jackColor = JACK_COLORS[props.colour] || props.colour;

	function onMousedown(e: MouseEvent) {
		e.stopPropagation();
		emit('jackDragStart', {
			moduleIndex: props.moduleIndex,
			connectorIndex: props.connectorIndex,
			type: props.type,
			colour: props.colour,
		});
	}

	function onMouseup(e: MouseEvent) {
		e.stopPropagation();
		emit('jackDragEnd', {
			moduleIndex: props.moduleIndex,
			connectorIndex: props.connectorIndex,
			type: props.type,
			colour: props.colour,
		});
	}

	// Label positioning
	// const labelX = computed(() => {
	// 	return props.type === 'input' ? props.x + 10 : props.x - 10;
	// });
</script>
<style scoped>
	.jack {
		cursor: crosshair;
	}

	.jack:hover {
		stroke-width: 2;
	}
</style>
