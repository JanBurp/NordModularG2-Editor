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
		<span
			v-if="indicator"
			class="indicator-strip"
			:class="indicatorValue ? 'indicator-bright' : 'indicator-dimmed'"
		/>
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
		indicator?: boolean;
		indicatorValue?: boolean;
	}

	const props = withDefaults(defineProps<Props>(), {
		active: false,
		disabled: false,
		size: 'normal',
		indicator: false,
		indicatorValue: false,
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

<style scoped>
.btn {
	position: relative;
}

.indicator-strip {
	position: absolute;
	top: 2px;
	left: 2px;
	right: 2px;
	height: 3px;
	border-radius: 2px 2px 0 0;
}

.indicator-strip.indicator-bright {
	background-color: #dc3232;
}

.indicator-strip.indicator-dimmed {
	background-color: rgba(220, 50, 50, 0.4);
}
</style>
