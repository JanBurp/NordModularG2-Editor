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
        <Card title="Slots">
          <div v-for="(slot, key) in device.settings.slots" :key="key" class="slot">
            <Label>{{ key }}:</Label>
            <span v-if="slot">Var {{ slot.variation }} - {{ slot.name }}</span>
            <span v-else>Empty</span>
          </div>
        </Card>

        <Card title="Program">
          <p>Bank {{ device.settings.bank }}, Program {{ device.settings.program }}</p>
        </Card>

        <Card title="Master Clock">
          <p>Tempo: {{ device.settings.masterClock.tempo }} BPM</p>
          <p>{{ device.settings.masterClock.running ? 'Running' : 'Stopped' }}</p>
        </Card>

        <Card title="MIDI In">
          <p>Channel {{ device.settings.midiIn.channel }}</p>
          <p>Soft Thru: {{ device.settings.midiIn.softThru ? 'On' : 'Off' }}</p>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import Label from '@/components/Label.vue'
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
</style>