<template>
	<input
		type="text"
		class="settings-input"
		v-bind="$attrs"
		:value="modelValue"
		:disabled="disabled"
		@input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
	/>
</template>

<script setup lang="ts">
	defineOptions({ inheritAttrs: false });

	withDefaults(
		defineProps<{
			modelValue: string;
			disabled?: boolean;
		}>(),
		{ disabled: false },
	);

	defineEmits<{
		'update:modelValue': [value: string];
	}>();
</script>
