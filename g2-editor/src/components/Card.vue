<template>
  <div class="card">
    <div v-if="title" class="card-title">{{ title }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<style scoped>
.card {
  background: #16213e;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.card-title {
  font-size: 12px;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}
</style>