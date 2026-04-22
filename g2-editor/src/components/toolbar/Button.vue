<script setup lang="ts">
interface Props {
  variant: 'default' | 'toggle' | 'variation' | 'tab' | 'file'
  active?: boolean
  disabled?: boolean
  accept?: string
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  disabled: false
})

const emit = defineEmits<{
  click: [event: MouseEvent]
  change: [event: Event]
}>()

const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}

const handleChange = (event: Event) => {
  emit('change', event)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  
  // Activate on Enter or Space key
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (props.variant === 'file') {
      // For file variant, trigger the hidden input click
      const input = (event.target as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement
      input?.click()
    } else {
      emit('click', event as unknown as MouseEvent)
    }
  }
}
</script>

<template>
  <!-- File variant uses label wrapper -->
  <label
    v-if="variant === 'file'"
    class="btn btn--file"
    :class="{ 'btn--disabled': disabled }"
    tabindex="0"
    role="button"
    @keydown="handleKeydown"
  >
    <slot />
    <input 
      type="file" 
      :accept="accept" 
      @change="handleChange"
    />
  </label>
  
  <!-- All other variants use button -->
  <button
    v-else
    class="btn"
    :class="[
      `btn--${variant}`,
      { 'btn--active': active },
      { 'btn--disabled': disabled }
    ]"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style scoped>
@reference "tailwindcss";

.btn {
  @apply inline-flex items-center justify-center h-8 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm transition-all font-normal;
}

.btn:hover:not(.btn--disabled) {
  @apply bg-neutral-600;
}

/* Variant: default */
.btn--default {
  @apply px-3;
}

/* Variant: toggle and tab */
.btn--toggle,
.btn--tab {
  @apply px-2.5 bg-neutral-800 border-neutral-700;
}

/* Variant: variation (square buttons) */
.btn--variation {
  @apply w-8 h-8 p-0 bg-neutral-800;
}

/* Variant: file */
.btn--file {
  @apply px-3 cursor-pointer;
}

.btn--file input[type="file"] {
  @apply hidden;
}

/* Active state - blue for all */
.btn--active {
  background-color: #4a6a8a !important;
  color: white !important;
  border-color: #5a7a9a !important;
}

/* Disabled state */
.btn--disabled {
  @apply opacity-50 cursor-not-allowed;
}

button:disabled {
  @apply opacity-50 cursor-not-allowed;
}

/* Focus styles for accessibility */
.btn:focus-visible {
  @apply outline-2 outline-blue-600 outline-offset-2;
}
</style>
