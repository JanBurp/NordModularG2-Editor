<template>
  <div class="max-w-xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">G2 Editor</h1>

    <div v-if="!device.connected">
      <Button @click="handleConnect" :disabled="loading">
        {{ loading ? 'Connecting...' : 'Connect to G2' }}
      </Button>
      <p v-if="error" class="text-red-400 mt-3">{{ error }}</p>
    </div>

    <div v-else>
      <p class="text-green-400 mb-4">Connected to {{ device.deviceName }}</p>
      <Button variant="secondary" @click="handleFetchSettings">Refresh Settings</Button>

      <div v-if="device.settings" class="mt-6">
        <Card title="Synth">
          <p>{{ device.settings.synthName }} ({{ device.settings.mode }})</p>
        </Card>

        <Card title="Slots">
          <div v-for="slot in device.settings.slots" :key="slot.slot" class="flex justify-between py-2 border-b border-gray-700">
            <span class="font-medium">{{ slot.slot }}:</span>
            <span v-if="slot.name">{{ slot.name }}</span>
            <span v-else class="text-gray-500 italic">Empty</span>
          </div>
        </Card>

        <Card v-if="device.settings.patches" title="Patch">
          <p>Name: {{ device.settings.patches.name }}</p>
          <p>Focus: {{ device.settings.patches.focus }}</p>
          <p>BPM: {{ device.settings.patches.bpm }}</p>
          <p>Clock: {{ device.settings.patches.clockRunning ? 'Running' : 'Stopped' }}</p>
        </Card>

        <Card v-if="device.settings.performance" title="Performance">
          <p>Name: {{ device.settings.performance.name }}</p>
          <p>Focus: {{ device.settings.performance.focus }}</p>
          <p>BPM: {{ device.settings.performance.bpm }}</p>
          <p>Clock: {{ device.settings.performance.clockRunning ? 'Running' : 'Stopped' }}</p>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Button from '@/components/Button.vue'
import Card from '@/components/Card.vue'
import { useG2 } from '@/composables/useG2'

const { loading, error, device, connect, fetchSettings } = useG2()

async function handleConnect() {
  await connect()
  if (device.connected) {
    await fetchSettings()
  }
}

async function handleFetchSettings() {
  await fetchSettings()
}

onMounted(async () => {
  await handleConnect()
})
</script>
