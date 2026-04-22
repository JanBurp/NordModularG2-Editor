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
  <div class="search-container">
    <input 
      ref="searchInputRef"
      v-model="searchValue"
      type="text"
      class="search-input"
      :placeholder="placeholder"
      @keydown.esc="clearSearch"
      @keydown.enter="handleEnter"
    />
    <span 
      v-show="searchValue" 
      class="clear-btn"
      @click="clearSearch"
    >×</span>
  </div>
</template>

<style scoped>
.search-container {
  margin-bottom: 12px;
  position: relative;
}

.search-input {
  width: 100%;
  padding: 8px 28px 8px 10px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

.search-input:focus {
  outline: none;
  border-color: #4a6a8a;
}

.search-input::placeholder {
  color: #666;
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: #888;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.clear-btn:hover {
  color: #e0e0e0;
}
</style>