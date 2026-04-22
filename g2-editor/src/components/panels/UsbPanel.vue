<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { UsbLogEntry, DeviceStatus } from '../composables/useG2Connection';

interface Props {
  logs: UsbLogEntry[];
  deviceStatus: DeviceStatus;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'disconnect': [];
  'connect': [];
  'clear-logs': [];
}>();

const logContainer = ref<HTMLElement | null>(null);

watch(() => props.logs.length, async () => {
  await nextTick();
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
});

const statusClass = computed(() => {
  switch (props.deviceStatus) {
    case 'connected': return 'status-connected';
    case 'connecting':
    case 'uploading':
    case 'downloading': return 'status-pending';
    case 'error':
    case 'unsupported': return 'status-error';
    default: return 'status-disconnected';
  }
});

const statusLabel = computed(() => {
  switch (props.deviceStatus) {
    case 'connected': return 'Connected';
    case 'connecting': return 'Connecting...';
    case 'disconnected': return 'Disconnected';
    case 'uploading': return 'Uploading...';
    case 'downloading': return 'Downloading...';
    case 'error': return 'Error';
    case 'unsupported': return 'Not Available';
    default: return 'Unknown';
  }
});

function handleDisconnect() {
  emit('disconnect');
}

function handleConnect() {
  emit('connect');
}

function handleClearLogs() {
  emit('clear-logs');
}
</script>

<script lang="ts">
import { computed } from 'vue';
</script>

<template>
  <div class="usb-panel">
    <div class="usb-status" :class="statusClass">
      <span class="status-icon">🔌</span>
      <span class="status-label">Status: {{ statusLabel }}</span>
      <button
        v-if="deviceStatus === 'connected'"
        class="disconnect-btn"
        @click="handleDisconnect"
      >
        Disconnect
      </button>
      <button
        v-else-if="deviceStatus !== 'connecting'"
        class="connect-btn"
        @click="handleConnect"
      >
        Connect
      </button>
    </div>

    <div class="log-header">
      <span class="log-title">Log:</span>
      <button class="clear-btn" @click="handleClearLogs">Clear</button>
    </div>

    <div ref="logContainer" class="log-container">
      <div v-if="logs.length === 0" class="log-empty">
        No USB activity yet
      </div>
      <div
        v-for="entry in logs"
        :key="entry.id"
        class="log-entry"
      >
        <div class="log-header-line">
          <span class="log-time">{{ entry.timestamp }}</span>
          <span class="log-dir">{{ entry.direction }}</span>
          <span class="log-event">{{ entry.event }}</span>
        </div>
        <div class="log-message-line">{{ entry.message }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.usb-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 8px;
}

.usb-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 4px;
  background-color: #1a1a1a;
}

.status-icon {
  font-size: 16px;
}

.status-label {
  font-size: 13px;
  font-weight: 500;
  color: #ddd;
}

.status-connected {
  border-left: 3px solid #4caf50;
}

.status-pending {
  border-left: 3px solid #ff9800;
}

.status-disconnected {
  border-left: 3px solid #666;
}

.status-error {
  border-left: 3px solid #f44336;
}

.disconnect-btn {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 11px;
  background-color: #333;
  color: #ddd;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.disconnect-btn:hover {
  background-color: #444;
}

.connect-btn {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 11px;
  background-color: #333;
  color: #ddd;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.connect-btn:hover {
  background-color: #444;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.log-title {
  font-size: 12px;
  font-weight: 500;
  color: #888;
}

.clear-btn {
  padding: 2px 8px;
  font-size: 11px;
  background-color: transparent;
  color: #888;
  border: 1px solid #444;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-btn:hover {
  background-color: #333;
  color: #ddd;
}

.log-container {
  flex: 1;
  overflow-y: auto;
  background-color: #111;
  border-radius: 4px;
  padding: 8px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 11px;
}

.log-empty {
  color: #555;
  text-align: center;
  padding: 20px;
}

.log-entry {
  padding: 4px 0;
  border-bottom: 1px solid #222;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-header-line {
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}

.log-message-line {
  color: #bbb;
  word-break: break-word;
  /* padding-left: 72px; */
}

.log-time {
  color: #666;
  flex-shrink: 0;
}

.log-dir {
  color: #888;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.log-event {
  color: #4fc3f7;
  flex-shrink: 0;
  font-weight: 500;
}
</style>
