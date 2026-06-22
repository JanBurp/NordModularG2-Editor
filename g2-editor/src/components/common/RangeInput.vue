<template>
	<div class="flex items-center gap-2 flex-1">
		<input
			type="range"
			class="flex-1"
			:min="min"
			:max="max"
			:step="step"
			:value="modelValue"
			@input="emit('update:modelValue', +($event.target as HTMLInputElement).value)"
		/>
		<span class="text-xs text-content-secondary w-8 text-right">{{ modelValue }}</span>
	</div>
</template>

<script setup lang="ts">
	withDefaults(
		defineProps<{
			modelValue: number;
			min: number;
			max: number;
			step?: number;
		}>(),
		{ step: 1 },
	);

	const emit = defineEmits<{
		'update:modelValue': [value: number];
	}>();
</script>
