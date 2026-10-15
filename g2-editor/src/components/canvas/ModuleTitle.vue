<template>
	<rect v-if="selected" :x="nameX" :width="nameWidth" :height="nameHeight" fill="#FFF" pointer-events="none" />
	<text v-if="isName" x="128" y="12" fill="#000" font-size="11" font-weight="800" font-family="'Inter'" text-anchor="middle">
		{{ displayName }}
	</text>
	<text v-else :x="nameX + 2" y="10" fill="#000" font-size="10" font-weight="700" font-family="'Inter'">
		{{ shownName }}
		<title v-if="shownName !== displayName">{{ displayName }}</title>
	</text>
</template>
<script lang="ts">
	// One shared canvas for text measurement (same font engine as the SVG text, zoom-independent).
	const measureCtx = document.createElement('canvas').getContext('2d');
	function measureText(s: string, font: string): number {
		if (!measureCtx) return 0;
		measureCtx.font = font;
		return measureCtx.measureText(s).width;
	}
</script>
<script setup lang="ts">
	import { computed, ref } from 'vue';

	const props = defineProps<{
		isName: boolean;
		displayName: string;
		selected: boolean;
		hasReplaceTrigger?: boolean;
	}>();

	// Re-measure once the Inter web font has loaded.
	const fontsReady = ref(false);
	document.fonts?.ready.then(() => (fontsReady.value = true));

	const NAME_FONT = "800 11px 'Inter'";
	const TITLE_FONT = "700 10px 'Inter'";

	// Reserve room for the replace-module trigger (a 17-wide hit area, see Module.vue) plus a
	// small gap, so its chevron doesn't overlap the module name.
	const REPLACE_TRIGGER_RESERVED_WIDTH = 14;

	// Right edge of the original editor's title bar (CNameBar: x 12, fixed width 64, clipped);
	// longer names are abbreviated with an ellipsis so they never run into the module's controls.
	const NAME_BAR_RIGHT = 76;

	const nameX = computed((): number => {
		if (props.isName) {
			return 128 - nameWidth.value / 2;
		}
		return props.hasReplaceTrigger ? REPLACE_TRIGGER_RESERVED_WIDTH : 2;
	});

	const shownName = computed(() => {
		void fontsReady.value;
		const name = props.displayName;
		const maxWidth = NAME_BAR_RIGHT - nameX.value - 4;
		if (measureText(name, TITLE_FONT) <= maxWidth) return name;
		let n = name.length - 1;
		while (n > 1 && measureText(name.slice(0, n).trimEnd() + '…', TITLE_FONT) > maxWidth) n--;
		return name.slice(0, n).trimEnd() + '…';
	});

	const nameWidth = computed((): number => {
		void fontsReady.value;
		if (props.isName) {
			return measureText(props.displayName, NAME_FONT) + 6;
		}
		return Math.min(measureText(shownName.value, TITLE_FONT) + 6, NAME_BAR_RIGHT - nameX.value);
	});

	const nameHeight = computed(() => {
		if (props.isName) {
			return 14;
		}
		return 12;
	});
</script>
