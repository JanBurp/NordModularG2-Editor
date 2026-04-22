<script setup lang="ts">
import { computed } from 'vue'
import Button from './Button.vue'

interface Option {
  label: string
  value: string | number
  disabled?: boolean
}

interface Props {
  modelValue: string | number
  options: (string | number | Option)[]
  variant?: 'toggle' | 'variation' | 'tab'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'toggle'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'toggle-off': [value: string | number]
}>()

const normalizedOptions = computed(() => {
  return props.options.map(opt => {
    if (typeof opt === 'object' && opt !== null && 'value' in opt) {
      return opt as Option
    }
    const val = opt as string | number
    return { label: String(val), value: val, disabled: false }
  })
})

const handleSelect = (value: string | number, disabled?: boolean) => {
  if (disabled) return
  if (props.modelValue === value) {
    emit('toggle-off', value)
  } else {
    emit('update:modelValue', value)
  }
}

const handleKeydown = (event: KeyboardEvent, index: number) => {
  const enabledIndices = normalizedOptions.value
    .map((opt, i) => ({ ...opt, index: i }))
    .filter(opt => !opt.disabled)
  
  const currentEnabledIndex = enabledIndices.findIndex(item => item.index === index)
  
  if (event.key === 'ArrowLeft' && currentEnabledIndex > 0) {
    event.preventDefault()
    const prevOption = enabledIndices[currentEnabledIndex - 1]
    handleSelect(prevOption.value)
    // Focus previous button
    const buttons = (event.target as HTMLElement).parentElement?.querySelectorAll('button')
    if (buttons) {
      buttons[prevOption.index]?.focus()
    }
  } else if (event.key === 'ArrowRight' && currentEnabledIndex < enabledIndices.length - 1) {
    event.preventDefault()
    const nextOption = enabledIndices[currentEnabledIndex + 1]
    handleSelect(nextOption.value)
    // Focus next button
    const buttons = (event.target as HTMLElement).parentElement?.querySelectorAll('button')
    if (buttons) {
      buttons[nextOption.index]?.focus()
    }
  }
}
</script>

<template>
  <div class="btn-group" role="group">
    <Button
      v-for="(option, index) in normalizedOptions"
      :key="option.value"
      :variant="variant"
      :active="modelValue === option.value"
      :disabled="option.disabled"
      class="btn-group__button"
      @click="handleSelect(option.value, option.disabled)"
      @keydown="(e) => handleKeydown(e, index)"
    >
      {{ option.label }}
    </Button>
  </div>
</template>

<style scoped>
.btn-group {
  display: flex;
  gap: 0;
}

.btn-group__button {
  border-radius: 0;
  margin: 0;
}

/* First button: round left corners */
.btn-group__button:first-child {
  border-radius: 4px 0 0 4px;
}

/* Last button: round right corners */
.btn-group__button:last-child {
  border-radius: 0 4px 4px 0;
}

/* Remove double borders between buttons */
.btn-group__button:not(:first-child) {
  border-left: none;
}
</style>
