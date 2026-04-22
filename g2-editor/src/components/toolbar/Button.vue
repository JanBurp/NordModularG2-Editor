<template>
	<!-- File variant uses label wrapper -->
	<label
		v-if="variant === 'file'"
		class="inline-flex items-center justify-center h-8 px-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm font-normal cursor-pointer"
		:class="{ 'opacity-50 cursor-not-allowed': disabled }"
		tabindex="0"
		role="button"
		@keydown="handleKeydown"
	>
		<slot />
		<input type="file" :accept="accept" class="hidden" @change="handleChange" />
	</label>

	<!-- All other variants use button -->
	<button
		v-else
		class="inline-flex items-center justify-center h-8 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm font-normal"
		:class="[
			variant === 'default' ? 'px-3' : '',
			variant === 'toggle' || variant === 'tab'
				? 'px-2.5 bg-neutral-800 border-neutral-700'
				: '',
			variant === 'variation' ? 'w-8 p-0 bg-neutral-800' : '',
			active ? '!bg-[#4a6a8a] !text-white !border-[#5a7a9a]' : '',
			disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-600',
		]"
		:disabled="disabled"
		@click="handleClick"
		focus-visible:outline-2
		focus-visible:outline-[#2563eb]
		focus-visible:outline-offset-2
	>
		<slot />
	</button>
</template>

<script setup lang="ts">
interface Props {
	variant: "default" | "toggle" | "variation" | "tab" | "file";
	active?: boolean;
	disabled?: boolean;
	accept?: string;
}

const props = withDefaults(defineProps<Props>(), {
	active: false,
	disabled: false,
});

const emit = defineEmits<{
	click: [event: MouseEvent];
	change: [event: Event];
}>();

const handleClick = (event: MouseEvent) => {
	if (!props.disabled) {
		emit("click", event);
	}
};

const handleChange = (event: Event) => {
	emit("change", event);
};

const handleKeydown = (event: KeyboardEvent) => {
	if (props.disabled) return;

	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		if (props.variant === "file") {
			const input = (event.target as HTMLElement).querySelector(
				'input[type="file"]',
			) as HTMLInputElement;
			input?.click();
		} else {
			emit("click", event as unknown as MouseEvent);
		}
	}
};
</script>
