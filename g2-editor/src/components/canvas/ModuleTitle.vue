<script setup lang="ts">
	const props = defineProps<{
		type: number;
		displayName: string;
	}>();
</script>

<template>
	<text
		v-if="type == '126'"
		x="128"
		y="11"
		fill="#000"
		font-size="10"
		font-weight="900"
		text-anchor="middle"
	>
		{{ displayName }}
	</text>
	<text v-else x="4" y="9" fill="#000" font-size="9" font-weight="900">
		{{ displayName }}
	</text>
</template>
