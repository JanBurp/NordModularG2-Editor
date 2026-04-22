<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  node: { required: true },
  depth: { type: Number, default: 0 },
  expanded: { required: true },
  getValueType: { type: Function, required: true },
  isExpandable: { type: Function, required: true }
});

const emit = defineEmits(['toggle']);

function handleToggle() {
  if (props.isExpandable(props.node)) {
    emit('toggle', props.node.key);
  }
}
</script>

<template>
  <div class="tree-node" :style="{ paddingLeft: depth * 4 + 'px' }">
    <div class="node-row" @click="handleToggle">
      <span v-if="isExpandable(node)" class="toggle">
        {{ expanded.has(node.key) ? '▼' : '▶' }}
      </span>
      <span v-else class="toggle-spacer"></span>
      <span class="node-key">{{ node.key }}:</span>
      <span v-if="!isExpandable(node)" class="node-value" :class="getValueType(node.value)">
        {{ node.value }}
      </span>
      <span v-else class="node-type">{{ node.value }}</span>
    </div>
    <div v-if="isExpandable(node) && expanded.has(node.key) && node.children" class="node-children">
      <TreeNode
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :depth="depth + 1"
        :expanded="expanded"
        :get-value-type="getValueType"
        :is-expandable="isExpandable"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  user-select: none;
}

.node-row {
  display: flex;
  align-items: center;
  padding: 3px 0;
  cursor: pointer;
  border-radius: 3px;
}

.node-row:hover {
  background-color: #2a2a2a;
}

.toggle {
  width: 16px;
  color: #888;
  font-size: 10px;
  flex-shrink: 0;
}

.toggle-spacer {
  width: 16px;
  flex-shrink: 0;
}

.node-key {
  color: #e06c75;
  margin-right: 4px;
}

.node-value {
  color: #98c379;
}

.node-value.string {
  color: #98c379;
}

.node-value.number {
  color: #d19a66;
}

.node-value.boolean {
  color: #56b6c2;
}

.node-type {
  color: #888;
  font-style: italic;
}

.node-children {
  margin-left: 0;
}
</style>
