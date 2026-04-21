<template>
  <div class="home">
    <h1>G2 Editor</h1>

    <div v-if="!device.connected">
      <Btn @click="handleConnect" :disabled="loading">
        {{ loading ? 'Connecting...' : 'Connect to G2' }}
      </Btn>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div v-else>
      <p class="status">Connected to {{ device.deviceName }}</p>
      <Btn variant="secondary" @click="handleFetchSettings">Refresh Settings</Btn>

      <div v-if="device.settings" class="settings">
        <Card title="Synth">
          <p>{{ device.settings.synthName }} ({{ device.settings.mode }})</p>
        </Card>

        <Card title="Slots">
          <div v-for="slot in device.settings.slots" :key="slot.slot" class="slot">
            <span class="slot-name">{{ slot.slot }}:</span>
            <span v-if="slot.name">{{ slot.name }}</span>
            <span v-else class="empty">Empty</span>
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
import Btn from '@/components/Btn.vue'
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

<style scoped>
.home {
  max-width: 600px;
  margin: 0 auto;
}

h1 {
  margin-bottom: 24px;
}

.status {
  color: #4ade80;
  margin-bottom: 16px;
}

.error {
  color: #f87171;
  margin-top: 12px;
}

.settings {
  margin-top: 24px;
}

.slot {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #1e3a5f;
}

.slot:last-child {
  border-bottom: none;
}

.slot-name {
  font-weight: 500;
}

.empty {
  color: #666;
  font-style: italic;
}
</style>