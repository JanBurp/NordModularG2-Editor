<template>
	<Teleport to="body">
		<div class="fixed bottom-10 right-3 z-50 flex flex-col gap-1.5 items-end pointer-events-none" role="status" aria-live="polite">
			<template v-for="t in toasts" :key="t.id">
				<div
					v-if="t.error"
					role="alert"
					class="pointer-events-auto relative max-w-sm px-3 py-2.5 text-sm text-content-primary bg-surface-1 border-2 border-red-500 rounded shadow-xl"
				>
					<button
						class="absolute top-1 right-1.5 text-content-secondary hover:text-content-primary cursor-pointer"
						aria-label="Close"
						@click="dismissToast(t.id)"
					>
						✕
					</button>
					<div class="font-semibold text-red-500 mb-1">⚠ Warning</div>
					<div>{{ t.message }}</div>
					<div class="flex justify-end gap-2 mt-2">
						<button
							v-if="t.action"
							class="px-3 py-0.5 text-xs rounded bg-input text-black font-medium hover:opacity-90 cursor-pointer"
							@click="runToastAction(t)"
						>
							{{ t.action.label }}
						</button>
						<button
							class="px-3 py-0.5 text-xs rounded bg-red-500 text-white font-medium hover:opacity-90 cursor-pointer"
							@click="dismissToast(t.id)"
						>
							OK
						</button>
					</div>
				</div>
				<div
					v-else
					class="pointer-events-auto max-w-xs px-3 py-2 text-xs text-content-primary bg-surface-1 border border-line-default rounded shadow-xl cursor-pointer"
					@click="dismissToast(t.id)"
				>
					{{ t.message }}
				</div>
			</template>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { useToast } from '@/composables/useToast';

	const { toasts, dismissToast, runToastAction } = useToast();
</script>
