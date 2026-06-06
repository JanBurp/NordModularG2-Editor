<template>
	<input
		:type="midiNote ? 'text' : 'number'"
		class="settings-input"
		v-bind="$attrs"
		:value="midiNote ? MidiNote(modelValue) : modelValue"
		:min="!midiNote ? min : undefined"
		:max="!midiNote ? max : undefined"
		:disabled="disabled"
		@change="handleChange"
	/>
</template>

<script setup lang="ts">
	import { MidiNote, parseMidiNote } from '@/renderer/parammap';

	defineOptions({ inheritAttrs: false });

	const props = withDefaults(
		defineProps<{
			modelValue: number;
			min?: number;
			max?: number;
			disabled?: boolean;
			midiNote?: boolean;
		}>(),
		{ disabled: false, midiNote: false },
	);

	const emit = defineEmits<{
		'update:modelValue': [value: number];
	}>();

	function handleChange(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		let v = props.midiNote ? (parseMidiNote(raw) ?? (parseInt(raw, 10) || 0)) : +raw;
		if (props.min !== undefined) v = Math.max(props.min, v);
		if (props.max !== undefined) v = Math.min(props.max, v);
		emit('update:modelValue', v);
	}
</script>
