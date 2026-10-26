<template>
	<g class="param-overlay" pointer-events="none">
		<MidiBadge
			v-for="badge in orderedBadges"
			:key="badge.id"
			:text="badge.text"
			:x="badge.x + badge.width / 2"
			:y="badge.y"
			anchor="top-center"
			@hover="onHover(badge.id)"
			@unhover="onUnhover(badge.id)"
		/>
	</g>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';
	import MidiBadge from './MidiBadge.vue';
	import { layoutBadges, estimateBadgeWidth, badgeHeight } from '../../utils/badgeLayout';

	const props = defineProps<{
		// x/y is the badge's centre (the official editor centres hints on a point); group = module,
		// only badges of the same group are stacked apart.
		items: Array<{ text: string; x: number; y: number; group?: number }>;
	}>();

	const hoveredId = ref<number | null>(null);

	// layoutBadges is O(n^2); skip re-running it when only badge text changed (e.g. a live param
	// value), not geometry — reuse each badge's previously resolved y by id instead.
	type PositionedBadge = { id: number; text: string; x: number; y: number; width: number; height: number; group?: number };
	let lastSignature = '';
	let lastLayout: PositionedBadge[] = [];

	const laidOutBadges = computed(() => {
		const boxed = props.items.map((item, id) => {
			const width = estimateBadgeWidth(item.text);
			const height = badgeHeight(item.text);
			return { id, text: item.text, x: item.x - width / 2, y: item.y - height / 2, width, height, group: item.group };
		});
		const signature = boxed.map((b) => `${b.id}:${b.group},${b.x},${b.y},${b.width},${b.height}`).join('|');
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
