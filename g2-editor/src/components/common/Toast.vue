<template>
	<Teleport to="body">
		<div class="fixed bottom-10 right-3 z-50 flex flex-col gap-1.5 items-end pointer-events-none" role="status" aria-live="polite">
			<div
				v-for="t in toasts"
				:key="t.id"
				class="pointer-events-auto max-w-xs px-3 py-2 text-xs text-content-primary bg-surface-1 border border-line-default rounded shadow-xl cursor-pointer"
				@click="dismissToast(t.id)"
			>
				{{ t.message }}
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { useToast } from '@/composables/useToast';

	const { toasts, dismissToast } = useToast();
</script>
