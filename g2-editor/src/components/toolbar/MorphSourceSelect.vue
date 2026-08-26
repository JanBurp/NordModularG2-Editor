<template>
	<div class="btn btn-xs" @click="emit('update:modelValue', (modelValue + 1) % MORPH_MODE_OPTIONS[morphIdx].length)">
		{{ MORPH_MODE_OPTIONS[morphIdx][modelValue] }}
	</div>
</template>

<script setup lang="ts">
	import { MORPH_MODE_OPTIONS } from '../../types/patch';

	defineProps<{ modelValue: number; morphIdx: number }>();
	const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
</script>
