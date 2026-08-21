<template>
	<select
		:value="modelValue"
		@change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
		class="h-6 px-1 border rounded bg-surface-2 text-content-primary cursor-pointer min-w-12 hover:bg-surface-3 focus:outline-none focus:border-line-default focus:shadow text-xs"
		:class="{ 'opacity-25': disabled }"
		:title="title"
		:disabled="disabled"
	>
		<option v-for="opt in options" :key="opt.id" :value="opt.id">
			{{ opt.name }}
		</option>
	</select>
</template>

<script setup lang="ts">
	interface SelectOption {
		id: string | number;
		name: string;
	}

	withDefaults(
		defineProps<{
			modelValue: string | number;
			options: SelectOption[];
			title?: string;
			disabled?: boolean;
		}>(),
		{
			disabled: false,
		},
	);

	defineEmits<{
		'update:modelValue': [value: string | number];
	}>();
</script>
