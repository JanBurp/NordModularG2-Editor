<template>
	<div class="bg-gray-800 rounded-lg p-4 mb-3">
		<div
			v-if="title"
			class="text-xs uppercase text-gray-400 mb-3 tracking-wide"
		>
			{{ title }}
		</div>
		<slot />
	</div>
</template>

<script setup lang="ts">
defineProps<{
	title?: string;
}>();
</script>
