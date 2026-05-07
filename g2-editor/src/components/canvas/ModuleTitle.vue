<template>
	<rect v-if="selected" :x="nameX" :width="nameWidth" :height="nameHeight" fill="#FFF" pointer-events="none" />
	<text ref="text" v-if="isName" x="128" y="11" fill="#000" font-size="10" font-weight="900" text-anchor="middle">
		{{ displayName }}
	</text>
	<text ref="text" v-else x="4" y="9" fill="#000" font-size="9" font-weight="900">
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
	}>();

	const nameWidth = computed(() => {
		const rect = text.value?.getBoundingClientRect(); //  .getComputedTextLength();
		return Number(rect?.width) + 6;
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
		return 2;
	});
</script>
