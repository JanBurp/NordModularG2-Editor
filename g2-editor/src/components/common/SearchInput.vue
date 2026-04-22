<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Search...'
  },
  isActive: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'enter']);

const searchInputRef = ref(null);
const searchValue = ref(props.modelValue);

watch(() => props.modelValue, (val) => {
  searchValue.value = val;
});

watch(searchValue, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.isActive, async (active) => {
  if (active) {
    await nextTick();
    searchInputRef.value?.focus();
  }
});

function clearSearch() {
  searchValue.value = '';
  searchInputRef.value?.blur();
}

function handleEnter() {
  emit('enter');
}
</script>

<template>
  <div class="relative mb-3">
    <input
      ref="searchInputRef"
      v-model="searchValue"
      type="text"
      class="w-full px-3 py-2 pr-8 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-xs focus:outline-none focus:border-blue-700 placeholder:text-neutral-500"
      :placeholder="placeholder"
      @keydown.esc="clearSearch"
      @keydown.enter="handleEnter"
    />
    <span
      v-show="searchValue"
      class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-base cursor-pointer leading-1 hover:text-neutral-200"
      @click="clearSearch"
    >×</span>
  </div>
</template>