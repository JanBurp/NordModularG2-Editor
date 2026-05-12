<template>
  <div class="w-8 h-8 flex flex-col items-center justify-center gap-1 bg-neutral-800 border border-neutral-600 rounded">
    <span class="text-xs text-neutral-300 font-mono">{{ value.toFixed(1) }}%</span>
    <div class="w-6 h-2 bg-neutral-700 overflow-hidden">
      <div
        class="h-full"
        :class="value >= 100 ? 'bg-red-500' : 'bg-green-500'"
        :style="{ width: Math.min(value, 100) + '%' }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  value: number;
}>();
</script>