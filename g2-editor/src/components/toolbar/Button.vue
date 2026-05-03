<template>
	<!-- File variant uses label wrapper -->
	<label v-if="variant === 'file'" class="btn btn-default btn-file" :class="{ 'btn-disabled': disabled }" tabindex="0" role="button" @keydown="handleKeydown">
		<slot />
		<input type="file" :accept="accept" class="hidden" @change="handleChange" />
	</label>

	<!-- All other variants use button -->
	<button
		v-else
		class="btn"
		:class="[variant === 'default' ? 'btn-default' : '', variant === 'toggle' || variant === 'tab' ? 'btn-toggle' : '', variant === 'variation' ? 'btn-variation' : '', sizeClass, active ? 'btn-active' : '', disabled ? 'btn-disabled' : 'btn-hover']"
		:disabled="disabled"
		@click="handleClick"
	>
		<slot />
	</button>
</template>

<script setup lang="ts">
	import { computed } from 'vue';

	interface Props {
		variant: 'default' | 'toggle' | 'variation' | 'tab' | 'file';
		active?: boolean;
		disabled?: boolean;
		accept?: string;
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
		change: [event: Event];
	}>();

	const handleClick = (event: MouseEvent) => {
		if (!props.disabled) {
			emit('click', event);
		}
	};

	const handleChange = (event: Event) => {
		emit('change', event);
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (props.disabled) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (props.variant === 'file') {
				const input = (event.target as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement;
				input?.click();
			} else {
				emit('click', event as unknown as MouseEvent);
			}
		}
	};
</script>
