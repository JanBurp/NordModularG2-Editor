<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue';

const props = defineProps({
  patch: {
    type: Object,
    required: true
  }
});

function buildTree(obj, key = '') {
  if (obj === null || obj === undefined) {
    return { key, value: 'null', type: 'primitive' };
  }
  
  if (Array.isArray(obj)) {
    const children = obj.map((item, index) => buildTree(item, String(index)));
    return { key, value: `[${obj.length}]`, type: 'array', children };
  }
  
  if (typeof obj === 'object') {
    const children = Object.entries(obj).map(([k, v]) => buildTree(v, k));
    return { key, value: `{${Object.keys(obj).length}}`, type: 'object', children };
  }
  
  return { key, value: String(obj), type: 'primitive' };
}

const tree = computed(() => buildTree(props.patch, 'patch'));

const expanded = ref(new Set(['patch', 'patch-header', 'patch-areas']));

const emit = defineEmits(['toggle']);

function toggle(key) {
  const newSet = new Set(expanded.value);
  if (newSet.has(key)) {
    newSet.delete(key);
  } else {
    newSet.add(key);
  }
  expanded.value = newSet;
  emit('toggle', key);
}

function getValueType(value) {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return typeof value;
}

function isExpandable(node) {
  return node.type === 'object' || node.type === 'array';
}
</script>

<template>
  <div class="patch-data">
    <div class="tree-view">
      <TreeNode 
        v-for="child in tree.children" 
        :key="child.key" 
        :node="child" 
        :depth="0" 
        :expanded="expanded"
        :get-value-type="getValueType"
        :is-expandable="isExpandable"
        @toggle="toggle"
      />
    </div>
  </div>
</template>

<script>
import TreeNode from '../common/TreeNode.vue';

export default {
  components: { TreeNode }
};
</script>

<style scoped>
.patch-data {
  height: 100%;
  overflow-y: auto;
  padding: 8px;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
}

.tree-view {
  color: #ddd;
}
</style>