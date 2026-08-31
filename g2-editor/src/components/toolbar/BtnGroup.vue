<template>
	<div :class="[isTrack ? 'flex btn-group-track' : 'flex gap-0', { 'flex-col': vertical }]" role="group">
		<Button
			v-for="(option, index) in normalizedOptions"
			:key="option.value"
			:variant="variant"
			:active="isActive(option.value)"
			:disabled="option.disabled"
			:size="size"
			:topIndicator="topIndicators ? topIndicators[index] !== undefined : false"
			:topIndicatorValue="topIndicators ? !!topIndicators[index] : false"
			:bottomIndicator="bottomIndicators ? bottomIndicators[index] !== undefined : false"
			:bottomIndicatorValue="bottomIndicators ? !!bottomIndicators[index] : false"
			:class="[isTrack ? 'btn-group-pill' : vertical ? 'btn-group-item-vertical' : 'btn-group-item', { 'flex-1': stretch }]"
			:data-testid="testIdPrefix ? `${testIdPrefix}-${option.value}` : undefined"
			:draggable="draggable && option.draggable !== false ? 'true' : undefined"
			@click="(event: MouseEvent) => handleSelect(option.value, option.disabled, event)"
			@keydown="(e: KeyboardEvent) => handleKeydown(e, index)"
			@dragstart.stop="draggable && emit('btn-dragstart', option.value)"
			@dragover.prevent
			@drop.prevent.stop="draggable && emit('btn-drop', option.value)"
			@contextmenu.prevent.stop="emit('btn-contextmenu', option.value, $event)"
			@mouseenter="option.hint && showHint(option.hint)"
			@mouseleave="clearHint"
		>
			{{ option.label }}
		</Button>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from './Button.vue';
	import type { Option } from '@/types/ui';
	import { useStatusHint } from '@/composables/useStatusHint';

	const { showHint, clearHint } = useStatusHint();

	interface Props {
		modelValue: string | number | null | (string | number)[];
		options: (string | number | Option)[];
		variant?: 'toggle' | 'variation' | 'tab';
		size?: 'normal' | 'small' | 'xs';
		multiSelect?: boolean;
		topIndicators?: boolean[];
		bottomIndicators?: boolean[];
		testIdPrefix?: string;
		draggable?: boolean;
		stretch?: boolean;
		vertical?: boolean;
	}

	const props = withDefaults(defineProps<Props>(), {
		variant: 'toggle',
		size: 'normal',
		multiSelect: false,
		topIndicators: () => [],
		bottomIndicators: () => [],
		testIdPrefix: undefined,
		draggable: false,
	});

	const emit = defineEmits<{
		'update:modelValue': [value: string | number | (string | number)[]];
		'toggle-off': [value: string | number];
		'shift-click': [value: string | number];
		'ctrl-click': [value: string | number];
		'btn-dragstart': [value: string | number];
		'btn-drop': [value: string | number];
		'btn-contextmenu': [value: string | number, event: MouseEvent];
	}>();

	const isTrack = computed(() => props.variant === 'toggle' || props.variant === 'tab');

	const normalizedOptions = computed(() => {
		return props.options.map((opt) => {
			if (typeof opt === 'object' && opt !== null && 'value' in opt) {
				return opt as Option;
			}
			const val = opt as string | number;
			return { label: String(val), value: val, disabled: false };
		});
	});

	const isActive = (value: string | number): boolean => {
		if (props.multiSelect && Array.isArray(props.modelValue)) {
			return props.modelValue.includes(value);
		}
		return props.modelValue === value;
	};

	const handleSelect = (value: string | number, disabled?: boolean, event?: MouseEvent) => {
		if (disabled) return;

		if (event?.shiftKey) {
			emit('shift-click', value);
			return;
		}
		if (event?.ctrlKey || event?.metaKey) {
			emit('ctrl-click', value);
			return;
		}

		if (props.multiSelect && Array.isArray(props.modelValue)) {
			const newValue = props.modelValue.includes(value) ? props.modelValue.filter((v) => v !== value) : [...props.modelValue, value];
			emit('update:modelValue', newValue);
		} else {
			if (props.modelValue === value) {
				emit('toggle-off', value);
			} else {
				emit('update:modelValue', value);
			}
		}
	};

	const handleKeydown = (event: KeyboardEvent, index: number) => {
		const enabledIndices = normalizedOptions.value.map((opt, i) => ({ ...opt, index: i })).filter((opt) => !opt.disabled);

		const currentEnabledIndex = enabledIndices.findIndex((item) => item.index === index);

		if (event.key === 'ArrowLeft' && currentEnabledIndex > 0) {
			event.preventDefault();
			const prevOption = enabledIndices[currentEnabledIndex - 1];
			handleSelect(prevOption.value);
			const buttons = (event.target as HTMLElement).parentElement?.querySelectorAll('button');
			if (buttons) {
				buttons[prevOption.index]?.focus();
			}
		} else if (event.key === 'ArrowRight' && currentEnabledIndex < enabledIndices.length - 1) {
			event.preventDefault();
			const nextOption = enabledIndices[currentEnabledIndex + 1];
			handleSelect(nextOption.value);
			const buttons = (event.target as HTMLElement).parentElement?.querySelectorAll('button');
			if (buttons) {
				buttons[nextOption.index]?.focus();
			}
		}
	};
</script>
