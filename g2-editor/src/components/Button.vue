<template>
  <button
    :class="[
      'px-5 py-2.5 rounded-md font-medium text-sm transition-opacity',
      variant === 'primary' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-700 text-white hover:bg-gray-600',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    ]"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}>()

defineEmits<{ click: [] }>()
</script>