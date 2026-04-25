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
			<circle :cx="x" :cy="y" r="6" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<circle :cx="x" :cy="y" r="3" fill="#000" stroke="#333" stroke-width="1" class="jack" />
		</template>
		<template v-else>
			<rect :x="x - 6" :y="y - 6" width="12" height="12" rx="2" ry="2" :fill="jackColor" stroke="#333" stroke-width="1" class="jack" />
			<rect :x="x - 3" :y="y - 3" width="6" height="6" rx="2" ry="2" fill="#000" stroke="#333" stroke-width="1" class="jack" />
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
