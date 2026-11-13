<template>
	<line pointer-events="none" :x1="ve.x1" :y1="ve.y1" :x2="ve.x2" :y2="ve.y2" :stroke="PANEL.line" />
</template>
<script setup lang="ts">
	import { PANEL } from '@/constants/colors';
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
