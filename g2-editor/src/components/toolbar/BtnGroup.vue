<template>
	<div class="flex gap-0" role="group">
		<Button
			v-for="(option, index) in normalizedOptions"
			:key="option.value"
			:variant="variant"
			:active="isActive(option.value)"
			:disabled="option.disabled"
			:size="size"
			class="rounded-none m-0 first:rounded-l last:rounded-r not-first:border-l-0"
			@click="handleSelect(option.value, option.disabled)"
			@keydown="(e: KeyboardEvent) => handleKeydown(e, index)"
		>
			{{ option.label }}
		</Button>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Button from "./Button.vue";

interface Option {
	label: string;
	value: string | number;
	disabled?: boolean;
}

interface Props {
	modelValue: string | number | null | (string | number)[];
	options: (string | number | Option)[];
	variant?: "toggle" | "variation" | "tab";
	size?: "normal" | "small";
	multiSelect?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	variant: "toggle",
	size: "normal",
	multiSelect: false,
});

const emit = defineEmits<{
	"update:modelValue": [value: string | number | (string | number)[]];
	"toggle-off": [value: string | number];
}>();

const normalizedOptions = computed(() => {
	return props.options.map((opt) => {
		if (typeof opt === "object" && opt !== null && "value" in opt) {
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

const handleSelect = (value: string | number, disabled?: boolean) => {
	if (disabled) return;

	if (props.multiSelect && Array.isArray(props.modelValue)) {
		const newValue = props.modelValue.includes(value)
			? props.modelValue.filter((v) => v !== value)
			: [...props.modelValue, value];
		emit("update:modelValue", newValue);
	} else {
		if (props.modelValue === value) {
			emit("toggle-off", value);
		} else {
			emit("update:modelValue", value);
		}
	}
};

const handleKeydown = (event: KeyboardEvent, index: number) => {
	const enabledIndices = normalizedOptions.value
		.map((opt, i) => ({ ...opt, index: i }))
		.filter((opt) => !opt.disabled);

	const currentEnabledIndex = enabledIndices.findIndex(
		(item) => item.index === index,
	);

	if (event.key === "ArrowLeft" && currentEnabledIndex > 0) {
		event.preventDefault();
		const prevOption = enabledIndices[currentEnabledIndex - 1];
		handleSelect(prevOption.value);
		const buttons = (
			event.target as HTMLElement
		).parentElement?.querySelectorAll("button");
		if (buttons) {
			buttons[prevOption.index]?.focus();
		}
	} else if (
		event.key === "ArrowRight" &&
		currentEnabledIndex < enabledIndices.length - 1
	) {
		event.preventDefault();
		const nextOption = enabledIndices[currentEnabledIndex + 1];
		handleSelect(nextOption.value);
		const buttons = (
			event.target as HTMLElement
		).parentElement?.querySelectorAll("button");
		if (buttons) {
			buttons[nextOption.index]?.focus();
		}
	}
};
</script>