<template>
	<text v-if="ve.t" pointer-events="none" :x="ve.x" :y="ve.y" :text-anchor="ve.anchor" :fill="PANEL.ink" font-size="9">
		{{ ve.t }}
	</text>
</template>
<script setup lang="ts">
	import { PANEL } from '@/constants/colors';
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
