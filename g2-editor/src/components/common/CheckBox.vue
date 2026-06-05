<template>
	<div
		role="checkbox"
		:aria-checked="modelValue"
		tabindex="0"
		class="w-4 h-4 rounded-xs cursor-pointer flex items-center justify-center shrink-0"
		:class="modelValue ? 'bg-green-600' : 'bg-neutral-300'"
		v-bind="$attrs"
		@click="toggle"
		@keydown.space.prevent="toggle"
	>
		<svg v-if="modelValue" viewBox="0 0 10 8" class="w-2.5 h-2 fill-none stroke-white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="1,4 4,7 9,1" />
		</svg>
	</div>
</template>

<script setup lang="ts">
	defineOptions({ inheritAttrs: false });

	const props = withDefaults(
		defineProps<{
			modelValue: boolean;
			disabled?: boolean;
		}>(),
		{ disabled: false },
	);

	const emit = defineEmits<{
		'update:modelValue': [value: boolean];
	}>();

	function toggle() {
		if (!props.disabled) emit('update:modelValue', !props.modelValue);
	}
</script>
