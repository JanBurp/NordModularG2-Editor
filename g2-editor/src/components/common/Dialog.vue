<template>
	<Teleport to="body">
		<div
			v-if="modelValue"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			@click.self="onCancel"
		>
			<div class="bg-neutral-800 border border-neutral-600 rounded shadow-xl min-w-72 max-w-md w-full mx-4">
				<div class="flex items-center justify-between px-4 py-3 border-b border-neutral-600">
					<span class="text-sm font-semibold text-neutral-200">{{ title }}</span>
					<button
						class="text-neutral-400 hover:text-neutral-200 text-lg leading-none cursor-pointer"
						@click="onCancel"
					>×</button>
				</div>
				<div class="px-4 py-3">
					<slot />
				</div>
				<div class="flex justify-end gap-2 px-4 py-3 border-t border-neutral-600">
					<button
						class="px-3 py-1 text-xs border border-neutral-500 rounded bg-neutral-700 text-neutral-200 hover:bg-neutral-600 cursor-pointer"
						@click="onCancel"
					>Cancel</button>
					<button
						class="px-3 py-1 text-xs border border-neutral-500 rounded bg-gray-300 text-gray-800 hover:bg-gray-200 cursor-pointer"
						@click="onConfirm"
					>OK</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

	const props = defineProps<{
		modelValue: boolean;
		title: string;
	}>();

	const emit = defineEmits<{
		'update:modelValue': [value: boolean];
		confirm: [];
		cancel: [];
	}>();

	function onConfirm() {
		emit('confirm');
		emit('update:modelValue', false);
	}

	function onCancel() {
		emit('cancel');
		emit('update:modelValue', false);
	}

	const dialogEl = ref<HTMLElement | null>(null);

	watch(() => props.modelValue, (open) => {
		if (open) nextTick(() => dialogEl.value?.querySelector<HTMLElement>('input, textarea')?.focus());
	});

	function onKeydown(e: KeyboardEvent) {
		if (!props.modelValue) return;
		if (e.key === 'Escape') onCancel();
		if (e.key === 'Enter') onConfirm();
	}

	onMounted(() => window.addEventListener('keydown', onKeydown));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
