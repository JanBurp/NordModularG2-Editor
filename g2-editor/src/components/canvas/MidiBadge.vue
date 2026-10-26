<template>
	<g class="midi-badge" pointer-events="auto" @pointerenter="hovered = true" @pointerleave="hovered = false">
		<!-- Official editor's hint look (CHintView::DrawHint): HINT_FILL, black outer and white inner 1 px frame. -->
		<rect :x="rectX + 0.5" :y="y + 0.5" :width="width - 1" :height="badgeHeight(text) - 1" :fill="HINT_FILL" stroke="#000" />
		<rect :x="rectX + 1.5" :y="y + 1.5" :width="width - 3" :height="badgeHeight(text) - 3" fill="none" stroke="#FFF" />
		<text ref="textRef" :x="rectX + width / 2" :y="y + 10" fill="#000" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">
			<tspan v-for="(line, i) in text.split('\n')" :key="i" :x="rectX + width / 2" :dy="i === 0 ? 0 : BADGE_LINE_HEIGHT">{{ line }}</tspan>
		</text>
	</g>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, watch, nextTick } from 'vue';
	import { HINT_FILL } from '../../constants/ui';
	import { estimateBadgeWidth, badgeHeight, BADGE_LINE_HEIGHT } from '../../utils/badgeLayout';

	const props = withDefaults(
		defineProps<{
			text: string;
			x: number;
			y: number;
			anchor?: 'top-left' | 'top-center';
		}>(),
		{ anchor: 'top-left' },
	);

	const emit = defineEmits<{
		hover: [];
		unhover: [];
	}>();

	const textRef = ref<SVGTextElement | null>(null);
	const width = ref(estimateBadgeWidth(props.text));
	const hovered = ref(false);

	const rectX = computed(() => (props.anchor === 'top-center' ? props.x - width.value / 2 : props.x));

	function measure() {
		if (textRef.value) width.value = Math.max(20, textRef.value.getBBox().width + 10);
	}

	onMounted(measure);
	watch(
		() => props.text,
		(text, prevText) => {
			// Monospace font: width only depends on the longest line's character count, so a same-length
			// text change (e.g. a live param value) can keep the already-measured width and skip the reflow.
			if (estimateBadgeWidth(text) !== estimateBadgeWidth(prevText)) nextTick(measure);
		},
	);
	watch(hovered, (v) => {
		if (v) emit('hover');
		else emit('unhover');
	});
</script>
