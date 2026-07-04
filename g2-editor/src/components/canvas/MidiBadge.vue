<template>
	<g class="midi-badge" pointer-events="auto" :opacity="opacity" @pointerenter="hovered = true" @pointerleave="hovered = false">
		<rect :x="rectX" :y="y" :width="width" height="14" fill="#FBBF24" stroke="#000" stroke-width="0.8" rx="2" />
		<text ref="textRef" :x="rectX + width / 2" :y="y + 10" fill="#000" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">{{ text }}</text>
	</g>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, watch, nextTick } from 'vue';

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
	const width = ref(Math.max(20, props.text.length * 7 + 10));
	const hovered = ref(false);

	const rectX = computed(() => (props.anchor === 'top-center' ? props.x - width.value / 2 : props.x));
	const opacity = computed(() => (hovered.value ? 1 : 0.9));

	function measure() {
		if (textRef.value) width.value = Math.max(20, textRef.value.getBBox().width + 10);
	}

	onMounted(measure);
	watch(
		() => props.text,
		() => nextTick(measure),
	);
	watch(hovered, (v) => {
		if (v) emit('hover');
		else emit('unhover');
	});
</script>
