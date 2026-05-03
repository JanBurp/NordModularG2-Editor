<template>
	<button
		class="btn"
		:class="[
			variant === 'default' ? 'btn-default' : '',
			variant === 'toggle' || variant === 'tab' ? 'btn-toggle' : '',
			variant === 'variation' ? 'btn-variation' : '',
			sizeClass,
			active ? 'btn-active' : '',
			disabled ? 'btn-disabled' : 'btn-hover',
		]"
		:disabled="disabled"
		@click="handleClick"
	>
		<slot />
	</button>
</template>

<script setup lang="ts">
	import { computed } from 'vue';

	interface Props {
		variant: 'default' | 'toggle' | 'variation' | 'tab';
		active?: boolean;
		disabled?: boolean;
		size?: 'normal' | 'small' | 'xs';
	}

	const props = withDefaults(defineProps<Props>(), {
		active: false,
		disabled: false,
		size: 'normal',
	});

	const sizeClass = computed(() => {
		if (props.size === 'xs') return 'btn-xs';
		if (props.size === 'small') return 'btn-small';
		return '';
	});

	const emit = defineEmits<{
		click: [event: MouseEvent];
	}>();

	const handleClick = (event: MouseEvent) => {
		if (!props.disabled) {
			emit('click', event);
		}
	};
</script>
