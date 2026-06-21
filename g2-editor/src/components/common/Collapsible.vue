<template>
	<div>
		<div class="flex items-center gap-2 cursor-pointer select-none py-2 px-2 bg-surface-0 text-content-secondary text-sm" @click="open = !open">
			<span class="text-content-muted text-xs w-2.5">{{ open ? '▼' : '▶' }}</span>
			<span class="font-medium">{{ title }}</span>
		</div>
		<div v-show="open" class="px-2 py-2 mb-4">
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref } from 'vue';

	const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean }>(), { defaultOpen: true });
	const open = ref(props.defaultOpen);
</script>
