<template>
	<Teleport to="body">
		<div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="onCancel">
			<div ref="dialogEl" class="bg-surface-1 border border-line-default rounded shadow-xl min-w-72 max-w-md w-full mx-4">
				<div class="px-4 py-3 border-b border-line-default">
					<span class="text-sm font-semibold text-content-primary">{{ title }}</span>
				</div>
				<div class="px-4 py-3">
					<slot />
				</div>
				<div class="flex justify-end gap-2 px-4 py-3 border-t border-line-default">
					<button class="px-3 py-1 text-xs rounded text-content-secondary hover:text-content-primary cursor-pointer" @click="onCancel">Cancel</button>
					<button
						v-if="showConfirm"
						class="px-3 py-1 text-xs rounded bg-input text-black font-medium hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="disableConfirm"
						@click="onConfirm"
					>
						{{ confirmLabel }}
					</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

	const props = withDefaults(
		defineProps<{
			modelValue: boolean;
			title: string;
			confirmLabel?: string;
			showConfirm?: boolean;
			closeOnConfirm?: boolean;
			disableConfirm?: boolean;
		}>(),
		{ confirmLabel: 'OK', showConfirm: true, closeOnConfirm: true, disableConfirm: false },
	);

	const emit = defineEmits<{
		'update:modelValue': [value: boolean];
		confirm: [];
		cancel: [];
	}>();

	function onConfirm() {
		emit('confirm');
		if (props.closeOnConfirm) emit('update:modelValue', false);
	}

	function onCancel() {
		emit('cancel');
		emit('update:modelValue', false);
	}

	const dialogEl = ref<HTMLElement | null>(null);

	watch(
		() => props.modelValue,
		(open) => {
			if (open) nextTick(() => dialogEl.value?.querySelector<HTMLElement>('input, textarea')?.focus());
		},
	);

	function onKeydown(e: KeyboardEvent) {
		if (!props.modelValue) return;
		if (e.key === 'Escape') onCancel();
		if (e.key === 'Enter' && props.showConfirm && !props.disableConfirm) {
			(document.activeElement as HTMLElement)?.blur();
			onConfirm();
		}
	}

	onMounted(() => window.addEventListener('keydown', onKeydown));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
