<script setup>
import { ref, computed, onMounted } from 'vue';
import SearchInput from '../common/SearchInput.vue';

const props = defineProps({
  isActive: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select']);

const patchFiles = ref([]);
const loading = ref(true);
const error = ref('');
const searchQuery = ref('');

const filteredFiles = computed(() => {
  if (!searchQuery.value) return patchFiles.value;
  const query = searchQuery.value.toLowerCase();
  return patchFiles.value.filter(file => 
    file.toLowerCase().includes(query)
  );
});

async function loadPatchList() {
  if (!window.electronAPI) {
    error.value = 'Electron API not available';
    loading.value = false;
    return;
  }

  try {
    const result = await window.electronAPI.patches.list();
    if (result.success && result.files) {
      patchFiles.value = result.files;
    } else {
      error.value = result.error || 'Failed to load patches';
    }
  } catch (e) {
    error.value = e.message;
  }
  loading.value = false;
}

function selectPatch(filename) {
  emit('select', filename);
}

function handleEnter() {
  if (filteredFiles.value.length > 0) {
    selectPatch(filteredFiles.value[0]);
  }
}

function formatName(filename) {
  return filename.replace('.pch2', '').replace('.prf2', '');
}

onMounted(() => {
  loadPatchList();
});
</script>

<template>
  <div class="patch-browser">
    <SearchInput
      v-model="searchQuery"
      placeholder="Search patches..."
      :isActive="isActive"
      @enter="handleEnter"
    />
    <div v-if="loading" class="loading">Loading patches...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredFiles.length === 0" class="empty">{{ searchQuery ? 'No patches match your search' : 'No patch files found' }}</div>
    <ul v-else class="file-list">
      <li
        v-for="file in filteredFiles"
        :key="file"
        class="file-item"
        @click="selectPatch(file)"
      >
        <span class="file-icon">📄</span>
        <span class="file-name">{{ formatName(file) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.patch-browser {
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}

.loading, .error, .empty {
  padding: 16px;
  text-align: center;
  color: #888;
}

.error {
  color: #e74c3c;
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.file-item:hover {
  background-color: #2a2a2a;
}

.file-icon {
  font-size: 14px;
}

.file-name {
  font-size: 13px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>