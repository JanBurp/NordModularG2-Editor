<template>
	<input
		type="text"
		class="settings-input"
		v-bind="$attrs"
		:value="modelValue"
		:disabled="disabled"
		@input="handleInput"
	/>
</template>

<script setup lang="ts">
	import { ref, onUnmounted } from 'vue';

	defineOptions({ inheritAttrs: false });

	const props = withDefaults(
		defineProps<{
			modelValue: string;
			disabled?: boolean;
			debounce?: number;
		}>(),
		{ disabled: false, debounce: 0 },
	);

	const emit = defineEmits<{
		'update:modelValue': [value: string];
	}>();

	const timerId = ref<ReturnType<typeof setTimeout> | null>(null);

	function handleInput(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		if (props.debounce > 0) {
			clearTimeout(timerId.value ?? undefined);
			timerId.value = setTimeout(() => emit('update:modelValue', val), props.debounce);
		} else {
			emit('update:modelValue', val);
		}
	}

	onUnmounted(() => clearTimeout(timerId.value ?? undefined));
</script>
