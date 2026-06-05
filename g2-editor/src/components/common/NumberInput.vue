<template>
	<input
		type="number"
		class="settings-input"
		v-bind="$attrs"
		:value="modelValue"
		:min="min"
		:max="max"
		:disabled="disabled"
		@change="$emit('update:modelValue', +($event.target as HTMLInputElement).value)"
	/>
</template>

<script setup lang="ts">
	defineOptions({ inheritAttrs: false });

	withDefaults(
		defineProps<{
			modelValue: number;
			min?: number;
			max?: number;
			disabled?: boolean;
		}>(),
		{ disabled: false },
	);

	defineEmits<{
		'update:modelValue': [value: number];
	}>();
</script>
