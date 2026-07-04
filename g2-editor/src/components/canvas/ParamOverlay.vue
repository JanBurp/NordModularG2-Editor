<template>
	<g class="param-overlay" pointer-events="none">
		<MidiBadge
			v-for="badge in orderedBadges"
			:key="badge.id"
			:text="badge.text"
			:x="badge.x"
			:y="badge.y"
			@hover="onHover(badge.id)"
			@unhover="onUnhover(badge.id)"
		/>
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

	// layoutBadges is O(n^2); skip re-running it when only badge text changed (e.g. a live param
	// value), not geometry — reuse each badge's previously resolved y by id instead.
	type PositionedBadge = { id: number; text: string; x: number; y: number; width: number; height: number };
	let lastSignature = '';
	let lastLayout: PositionedBadge[] = [];

	const laidOutBadges = computed(() => {
		const boxed = props.items.map((item, id) => ({
			id,
			text: item.text,
			x: item.x,
			y: item.y,
			width: estimateBadgeWidth(item.text),
			height: 14,
		}));
		const signature = boxed.map((b) => `${b.id}:${b.x},${b.y},${b.width}`).join('|');
		if (signature === lastSignature) {
			const resolvedY = new Map(lastLayout.map((b) => [b.id, b.y]));
			return boxed.map((b) => ({ ...b, y: resolvedY.get(b.id) ?? b.y }));
		}
		lastSignature = signature;
		lastLayout = layoutBadges(boxed);
		return lastLayout;
	});

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
