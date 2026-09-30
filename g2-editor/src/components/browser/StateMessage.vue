<template>
	<div class="p-4 text-center" :class="colorClass">
		<Spinner v-if="variant === 'loading'" class="mx-auto mb-2" />
		{{ message }}
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Spinner from '../common/Spinner.vue';

	const props = defineProps<{
		variant: 'loading' | 'error' | 'empty';
		message: string;
	}>();

	const colorClass = computed(() => {
		switch (props.variant) {
			case 'error':
				return 'text-red-500';
			case 'loading':
			case 'empty':
			default:
				return 'text-content-muted';
		}
	});
</script>
