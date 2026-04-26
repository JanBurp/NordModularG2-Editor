<script setup lang="ts">
	// import { computed } from 'vue';
	import { JACK_COLORS } from '../../constants';

	const props = defineProps<{
		name: string;
		colour: string;
		x: number;
		y: number;
		type: 'input' | 'output';
	}>();

	const jackColor = JACK_COLORS[props.colour] || props.colour;

	// Label positioning
	// const labelX = computed(() => {
	// 	return props.type === 'input' ? props.x + 10 : props.x - 10;
	// });
</script>

<template>
	<g class="jack-group" :class="type">
		<template v-if="type == 'input'">
			<circle :cx="x" :cy="y" r="5.5" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<circle :cx="x" :cy="y" r="2.5" fill="#000" stroke="#333" stroke-width="1" class="jack" />
		</template>
		<template v-else>
			<rect :x="x - 5.5" :y="y - 5.5" width="11" height="11" rx="1" ry="1" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<rect :x="x - 2.5" :y="y - 2.5" width="5" height="5" rx="1" ry="1" fill="#000" stroke="#333" stroke-width="1" class="jack" />
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

<style scoped>
	.jack {
		cursor: crosshair;
	}

	.jack:hover {
		stroke-width: 2;
	}
</style>
