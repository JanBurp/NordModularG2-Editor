<template>
	<div class="relative mb-3">
		<input
			ref="searchInputRef"
			v-model="searchValue"
			type="text"
			class="search-input"
			:placeholder="placeholder"
			@keydown.esc="clearSearch"
			@keydown.enter="handleEnter"
		/>
		<span v-show="searchValue" class="search-clear" @click="clearSearch">×</span>
	</div>
</template>
<script setup lang="ts">
	import { ref, watch, nextTick } from 'vue';

	const props = defineProps({
		modelValue: {
			type: String,
			default: '',
		},
		placeholder: {
			type: String,
			default: 'Search...',
		},
		isActive: {
			type: Boolean,
			default: false,
		},
	});

	const emit = defineEmits(['update:modelValue', 'enter']);

	const searchInputRef = ref(null);
	const searchValue = ref(props.modelValue);

	watch(
		() => props.modelValue,
		(val) => {
			searchValue.value = val;
		},
	);

	watch(searchValue, (val) => {
		emit('update:modelValue', val);
	});

	watch(
		() => props.isActive,
		async (active) => {
			if (active) {
				await nextTick();
				searchInputRef.value?.focus();
			}
		},
	);

	function clearSearch() {
		searchValue.value = '';
		searchInputRef.value?.blur();
	}

	function handleEnter() {
		emit('enter');
	}
</script>
