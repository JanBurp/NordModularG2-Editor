<template>
	<Teleport to="body">
		<div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div class="flex flex-col items-center gap-3">
				<Spinner />
				<span v-if="message" class="text-content-secondary text-sm">{{ message }}</span>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import Spinner from './Spinner.vue';

	defineProps<{ show: boolean; message?: string }>();
</script>
