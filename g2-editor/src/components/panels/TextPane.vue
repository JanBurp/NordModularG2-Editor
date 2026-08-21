<template>
	<div class="flex flex-col h-full overflow-hidden text-xs text-neutral-200 bg-neutral-900">
		<textarea
			class="flex-1 resize-none bg-neutral-900 text-neutral-200 p-2 outline-none disabled:opacity-40"
			:value="text"
			:disabled="!hasPatch"
			placeholder="Patch notes…"
			@input="handleInput"
		></textarea>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref, onUnmounted } from 'vue';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const slot = computed(() => uiStore.slotInFocus);
	const hasPatch = computed(() => !!(slot.value && slotsStore.slots[slot.value].patch));
	const text = computed(() => (slot.value ? (slotsStore.slots[slot.value].patch?.text ?? '') : ''));

	const timerId = ref<ReturnType<typeof setTimeout> | null>(null);

	function handleInput(e: Event) {
		const val = (e.target as HTMLTextAreaElement).value;
		clearTimeout(timerId.value ?? undefined);
		timerId.value = setTimeout(() => slotsStore.setPatchText(val), 500);
	}

	onUnmounted(() => clearTimeout(timerId.value ?? undefined));
</script>
