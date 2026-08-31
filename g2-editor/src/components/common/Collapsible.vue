<template>
	<div>
		<div class="flex items-center gap-2 cursor-pointer select-none py-2 px-2 bg-surface-0 text-content-secondary text-sm" @click="toggle">
			<Icon :name="open ? 'chevronDown' : 'chevronRight'" class="w-2.5 h-2.5 text-content-muted shrink-0" />
			<span class="font-medium">{{ title }}</span>
		</div>
		<div v-show="open" class="px-2 py-2 mb-4">
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, watch } from 'vue';
	import Icon from './Icon.vue';

	const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean; modelValue?: boolean }>(), { defaultOpen: true });
	const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

	const open = ref(props.modelValue ?? props.defaultOpen);

	watch(
		() => props.modelValue,
		(v) => {
			if (v !== undefined) open.value = v;
		},
	);

	function toggle() {
		open.value = !open.value;
		emit('update:modelValue', open.value);
	}
</script>
