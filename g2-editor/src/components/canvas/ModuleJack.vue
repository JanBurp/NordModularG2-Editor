<template>
	<g
		class="jack-group"
		:class="type"
		:data-jack="`${type}-${connectorIndex}`"
		:data-jack-name="name"
		@mousedown.stop="onMousedown"
		@mouseup.stop="onMouseup"
		@contextmenu.stop.prevent="onContextMenu"
		@mouseenter="onMouseenter"
		@mouseleave="onMouseleave"
	>
		<!-- Larger hit area for easier clicking/dragging -->
		<circle v-if="type === 'input'" :cx="x" :cy="y" r="10" fill="none" style="pointer-events: all" />
		<rect v-else :x="x - 10" :y="y - 10" width="20" height="20" rx="1" fill="none" style="pointer-events: all" />
		<template v-if="type == 'input'">
			<circle :cx="x" :cy="y" r="5.5" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<circle :cx="x" :cy="y" r="2.5" :fill="connected ? jackColor : '#000'" stroke="#333" stroke-width="1" class="jack" />
		</template>
		<template v-else>
			<rect :x="x - 5.5" :y="y - 5.5" width="11" height="11" rx="1" ry="1" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<rect
				:x="x - 2.5"
				:y="y - 2.5"
				width="5"
				height="5"
				rx="1"
				ry="1"
				:fill="connected ? jackColor : '#000'"
				stroke="#333"
				stroke-width="1"
				class="jack"
			/>
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
	import { JACK_COLORS, getEffectiveJackColor } from '../../constants';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { buildCableColorItems } from '../../utils/colorSwatches';
	import { computed } from 'vue';

	const props = defineProps<{
		name: string;
		colour: string;
		uprated?: boolean;
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
		jackDeleteConnected: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackBreakConnection: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackSetCableColor: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colorId: number }];
		jackHoverEnter: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackHoverLeave: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
	}>();

	const { open: openContextMenu } = useContextMenu();

	const effectiveColour = computed(() => getEffectiveJackColor(props.colour, props.uprated ?? false));
	const jackColor = computed(() => JACK_COLORS[effectiveColour.value] || effectiveColour.value);

	function onContextMenu(e: MouseEvent) {
		if (!props.connected) return;
		openContextMenu(e, [
			{
				label: 'Delete connected',
				action: () => emit('jackDeleteConnected', { moduleIndex: props.moduleIndex, connectorIndex: props.connectorIndex, type: props.type }),
			},
			{
				label: 'Break',
				action: () => emit('jackBreakConnection', { moduleIndex: props.moduleIndex, connectorIndex: props.connectorIndex, type: props.type }),
			},
			{ type: 'separator' },
			{
				label: 'Set Cable Color',
				children: buildCableColorItems((colorId) =>
					emit('jackSetCableColor', { moduleIndex: props.moduleIndex, connectorIndex: props.connectorIndex, type: props.type, colorId }),
				),
			},
		]);
	}

	function onMousedown(e: MouseEvent) {
		e.stopPropagation();
		emit('jackDragStart', {
			moduleIndex: props.moduleIndex,
			connectorIndex: props.connectorIndex,
			type: props.type,
			colour: effectiveColour.value,
		});
	}

	function onMouseenter() {
		emit('jackHoverEnter', { moduleIndex: props.moduleIndex, connectorIndex: props.connectorIndex, type: props.type });
	}

	function onMouseleave() {
		emit('jackHoverLeave', { moduleIndex: props.moduleIndex, connectorIndex: props.connectorIndex, type: props.type });
	}

	function onMouseup(e: MouseEvent) {
		e.stopPropagation();
		emit('jackDragEnd', {
			moduleIndex: props.moduleIndex,
			connectorIndex: props.connectorIndex,
			type: props.type,
			colour: effectiveColour.value,
		});
	}
</script>
<style scoped>
	.jack {
		cursor: crosshair;
	}

	.jack:hover {
		stroke-width: 2;
	}
</style>
