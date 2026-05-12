<template>
  <div class="flex flex-col gap-1">
    <div class="flex gap-4 pl-10">
      <span class="text-xs text-neutral-400">cycles</span>
      <span class="text-xs text-neutral-400">memory</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="w-8 text-xs text-neutral-400">VA</span>
      <CPUpart :value="va.cycles" />
      <CPUpart :value="va.memory" />
    </div>
    <div class="flex items-center gap-2">
      <span class="w-8 text-xs text-neutral-400">FX</span>
      <CPUpart :value="fx.cycles" />
      <CPUpart :value="fx.memory" />
    </div>
  </div>
</template>

<script setup lang="ts">
import CPUpart from './CPUpart.vue';

defineProps<{
  va: { cycles: number; memory: number };
  fx: { cycles: number; memory: number };
}>();
</script>