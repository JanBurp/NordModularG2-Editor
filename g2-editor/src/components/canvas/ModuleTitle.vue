<template>
	<text v-if="isName" x="128" y="11" fill="#000" font-size="10" font-weight="900" text-anchor="middle">
		{{ displayName }}
	</text>
	<text v-else x="4" y="9" fill="#000" font-size="9" font-weight="900">
		{{ displayName }}
	</text>
</template>
<script setup lang="ts">
	defineProps<{
		isName: boolean;
		displayName: string;
	}>();
</script>
