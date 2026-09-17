<template>
	<rect v-if="selected" :x="nameX" :width="nameWidth" :height="nameHeight" fill="#FFF" pointer-events="none" />
	<text ref="text" v-if="isName" x="128" y="12" fill="#000" font-size="11" font-weight="800" font-family="'Inter'" text-anchor="middle">
		{{ displayName }}
	</text>
	<text ref="text" v-else :x="nameX + 2" y="10" fill="#000" font-size="10" font-weight="700" font-family="'Inter'">
		{{ displayName }}
	</text>
</template>
<script setup lang="ts">
	import { computed, ref } from 'vue';

	const text = ref<HTMLDivElement>();

	const props = defineProps<{
		isName: boolean;
		displayName: string;
		selected: boolean;
		hasReplaceTrigger?: boolean;
	}>();

	// Reserve room for the replace-module trigger (a 17-wide hit area, see Module.vue) plus a
	// small gap, so its chevron doesn't overlap the module name.
	const REPLACE_TRIGGER_RESERVED_WIDTH = 16;

	const nameWidth = computed(() => {
		const rect = text.value?.getBoundingClientRect(); //  .getComputedTextLength();
		return (rect?.width ?? 0) + 6;
	});

	const nameHeight = computed(() => {
		if (props.isName) {
			return 14;
		}
		return 12;
	});

	const nameX = computed(() => {
		if (props.isName) {
			return 128 - nameWidth.value / 2;
		}
		return props.hasReplaceTrigger ? REPLACE_TRIGGER_RESERVED_WIDTH : 2;
	});
</script>
