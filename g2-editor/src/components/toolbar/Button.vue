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
		<span v-if="topIndicator" class="indicator-strip indicator-top" :class="topIndicatorValue ? 'indicator-bright' : 'indicator-dimmed'" />
		<slot />
		<span v-if="bottomIndicator" class="indicator-strip indicator-bottom" :class="bottomIndicatorValue ? 'indicator-bright' : 'indicator-dimmed'" />
	</button>
</template>

<script setup lang="ts">
	import { computed } from 'vue';

	interface Props {
		variant: 'default' | 'toggle' | 'variation' | 'tab';
		active?: boolean;
		disabled?: boolean;
		size?: 'normal' | 'small' | 'xs';
		topIndicator?: boolean;
		topIndicatorValue?: boolean;
		bottomIndicator?: boolean;
		bottomIndicatorValue?: boolean;
	}

	const props = withDefaults(defineProps<Props>(), {
		active: false,
		disabled: false,
		size: 'normal',
		topIndicator: false,
		topIndicatorValue: false,
		bottomIndicator: false,
		bottomIndicatorValue: false,
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
		left: 0px;
		right: 0px;
		height: 4px;
	}

	.indicator-top {
		top: 0px;
	}

	.indicator-bottom {
		bottom: 0px;
	}

	.indicator-strip.indicator-bright {
		background-color: #ff3232;
	}

	.indicator-strip.indicator-dimmed {
		background-color: rgba(220, 50, 50, 0.4);
	}
</style>
