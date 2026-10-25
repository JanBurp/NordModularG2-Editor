<template>
	<Teleport to="body">
		<div
			v-if="modelValue"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			@mousedown.self="backdropDown = true"
			@mouseup.self="onBackdropUp"
			@mousedown.capture="onMouseDownCapture"
		>
			<div
				ref="dialogEl"
				role="dialog"
				aria-modal="true"
				:aria-label="title"
				tabindex="-1"
				class="bg-surface-1 border border-line-default rounded shadow-xl min-w-72 max-w-md w-full mx-4 outline-none"
			>
				<div class="px-4 py-3 border-b border-line-default">
					<span class="text-sm font-semibold text-content-primary">{{ title }}</span>
				</div>
				<div class="px-4 py-3">
					<slot />
				</div>
				<div class="flex justify-end gap-2 px-4 py-3 border-t border-line-default">
					<button
						v-if="showCancel"
						class="px-3 py-1 text-xs rounded text-content-secondary hover:text-content-primary cursor-pointer"
						@click="onCancel"
					>
						Cancel
					</button>
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
			showCancel?: boolean;
			closeOnConfirm?: boolean;
			disableConfirm?: boolean;
			preventClose?: boolean;
		}>(),
		{ confirmLabel: 'OK', showConfirm: true, showCancel: true, closeOnConfirm: true, disableConfirm: false, preventClose: false },
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
		if (props.preventClose) return;
		emit('cancel');
		emit('update:modelValue', false);
	}

	const dialogEl = ref<HTMLElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	// Only a click that both starts and ends on the backdrop closes (not a text-selection drag released outside the box)
	let backdropDown = false;
	function onMouseDownCapture(e: MouseEvent) {
		if (e.target !== e.currentTarget) backdropDown = false;
	}
	function onBackdropUp() {
		if (backdropDown) onCancel();
		backdropDown = false;
	}

	watch(
		() => props.modelValue,
		(open) => {
			if (open) {
				previouslyFocused = document.activeElement as HTMLElement | null;
				nextTick(() => (dialogEl.value?.querySelector<HTMLElement>('input, textarea') ?? dialogEl.value)?.focus());
			} else {
				previouslyFocused?.focus();
				previouslyFocused = null;
			}
		},
	);

	function trapTab(e: KeyboardEvent) {
		const items = Array.from(
			dialogEl.value?.querySelectorAll<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])') ?? [],
		).filter((el) => !el.hasAttribute('disabled'));
		if (items.length === 0) return e.preventDefault();
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (e.shiftKey && (active === first || !dialogEl.value?.contains(active))) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (active === last || !dialogEl.value?.contains(active))) {
			e.preventDefault();
			first.focus();
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (!props.modelValue) return;
		if (e.key === 'Escape') {
			// The Escape is the dialog's: stop it reaching window-level handlers that would act on it
			// too (e.g. the Bank Organizer closing itself), since the dialog is already gone by then.
			e.stopPropagation();
			onCancel();
		}
		if (e.key === 'Tab') trapTab(e);
		// A focused button (e.g. Cancel) handles Enter itself via its click
		if (e.key === 'Enter' && props.showConfirm && !props.disableConfirm && document.activeElement?.tagName !== 'BUTTON') {
			// Capture phase + stop: otherwise global handlers (e.g. PatchBrowser's Enter = activate item) swallow or double-handle it
			e.preventDefault();
			e.stopImmediatePropagation();
			(document.activeElement as HTMLElement)?.blur();
			onConfirm();
		}
	}

	onMounted(() => window.addEventListener('keydown', onKeydown, true));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown, true));
</script>
