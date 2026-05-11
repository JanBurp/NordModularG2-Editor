<template>
	<g>
		<rect
			v-for="g in ghosts"
			:key="g.idx"
			:x="g.x"
			:y="g.y"
			:width="256"
			:height="g.height"
			fill="rgba(255,165,0,0.25)"
			stroke="orange"
			stroke-width="2"
			rx="2"
			pointer-events="none"
		/>
	</g>
</template>
<script setup lang="ts">
	defineProps<{ ghosts: { idx: number; x: number; y: number; height: number }[] }>();
</script>
