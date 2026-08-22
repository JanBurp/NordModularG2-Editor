<template>
	<div class="morph-source-btn" @click="emit('update:modelValue', (modelValue + 1) % MORPH_MODE_OPTIONS[morphIdx].length)">
		{{ MORPH_MODE_OPTIONS[morphIdx][modelValue] }}
	</div>
</template>

<script setup lang="ts">
	import { MORPH_MODE_OPTIONS } from '../../types/patch';

	defineProps<{ modelValue: number; morphIdx: number }>();
	const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
</script>

<style scoped>
	.morph-source-btn {
		cursor: pointer;
		height: 11px;
		min-width: 38px;
		padding: 0 2px;
		font-size: 8px;
		line-height: 11px;
		text-align: center;
		background: #ccc;
		border: 1px solid #333;
		color: #000;
		user-select: none;
		white-space: nowrap;
	}

	.morph-source-btn:hover {
		background: #bbb;
	}
</style>
