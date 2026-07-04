<template>
	<g class="param-overlay" pointer-events="none">
		<MidiBadge v-for="badge in orderedBadges" :key="badge.id" :text="badge.text" :x="badge.x" :y="badge.y" @hover="onHover(badge.id)" @unhover="onUnhover(badge.id)" />
	</g>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';
	import MidiBadge from './MidiBadge.vue';
	import { layoutBadges, estimateBadgeWidth } from '../../utils/badgeLayout';

	const props = defineProps<{
		items: Array<{ text: string; x: number; y: number }>;
	}>();

	const hoveredId = ref<number | null>(null);

	const laidOutBadges = computed(() =>
		layoutBadges(
			props.items.map((item, id) => ({
				id,
				text: item.text,
				x: item.x,
				y: item.y,
				width: estimateBadgeWidth(item.text),
				height: 14,
			})),
		),
	);

	const orderedBadges = computed(() => {
		if (hoveredId.value === null) return laidOutBadges.value;
		const hovered = laidOutBadges.value.find((b) => b.id === hoveredId.value);
		if (!hovered) return laidOutBadges.value;
		return [...laidOutBadges.value.filter((b) => b.id !== hoveredId.value), hovered];
	});

	function onHover(id: number) {
		hoveredId.value = id;
	}

	function onUnhover(id: number) {
		if (hoveredId.value === id) hoveredId.value = null;
	}
</script>
