<template>
	<path v-if="ve.d" pointer-events="none" :d="ve.d" :stroke="PANEL.line" fill="none" />
</template>
<script setup lang="ts">
	import { PANEL } from '@/constants/colors';
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
