<template>
	<path v-if="ve.d" pointer-events="none" :d="ve.d" stroke="#333" fill="none" />
</template>
<script setup lang="ts">
	import type { VisualElement } from '../../types';
	defineProps<{
		ve: VisualElement;
	}>();
</script>
