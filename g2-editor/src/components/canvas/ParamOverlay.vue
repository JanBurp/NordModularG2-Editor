<template>
	<g class="param-overlay" pointer-events="none">
		<g v-for="(item, i) in items" :key="i">
			<rect :x="item.x" :y="item.y" :width="badgeWidth(item.text)" height="14" :fill="item.color ?? '#FF0'" stroke="#000" stroke-width="0.8" rx="2" />
			<text :x="item.x + badgeWidth(item.text) / 2" :y="item.y + 10" fill="#000" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">{{ item.text }}</text>
		</g>
	</g>
</template>

<script setup lang="ts">
	defineProps<{
		items: Array<{ text: string; x: number; y: number; color?: string }>;
	}>();

	function badgeWidth(text: string): number {
		return Math.max(26, text.length * 7 + 8);
	}
</script>
