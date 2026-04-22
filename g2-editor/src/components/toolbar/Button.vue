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
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  background: #3a3a3a;
  border: 1px solid #4a4a4a;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  font-family: inherit;
}

.btn:hover:not(.btn--disabled) {
  background: #4a4a4a;
}

/* Variant: default */
.btn--default {
  padding: 0 12px;
}

/* Variant: toggle and tab */
.btn--toggle,
.btn--tab {
  padding: 0 10px;
  background: #2a2a2a;
  border-color: #3a3a3a;
}

/* Variant: variation (square buttons) */
.btn--variation {
  width: 32px;
  height: 32px;
  padding: 0;
  background: #2a2a2a;
}

/* Variant: file */
.btn--file {
  padding: 0 12px;
  cursor: pointer;
}

.btn--file input[type="file"] {
  display: none;
}

/* Active state - blue for all */
.btn--active {
  background: #4a6a8a !important;
  color: #fff !important;
  border-color: #5a7a9a !important;
}

/* Disabled state */
.btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Focus styles for accessibility */
.btn:focus-visible {
  outline: 2px solid #5a7a9a;
  outline-offset: 2px;
}
</style>
