<template>
	<select
		:value="modelValue"
		@change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
		class="h-8 px-1 border rounded bg-neutral-300 text-black cursor-pointer min-w-24 hover:bg-gray-200 focus:outline-none focus:border-neutral-600 focus:shadow"
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
		}
	);

	defineEmits<{
		'update:modelValue': [value: string | number];
	}>();
</script>