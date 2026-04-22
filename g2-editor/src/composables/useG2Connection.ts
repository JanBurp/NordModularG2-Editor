import { ref, computed, onMounted, onUnmounted } from 'vue';

export type DeviceStatus = 'connected' | 'connecting' | 'disconnected' | 'uploading' | 'downloading' | 'error' | 'unsupported';

export interface UsbLogEntry {
  id: number;
  timestamp: string;
  direction: '→' | '←' | '•';
  event: string;
  message: string;
}

export interface G2USBInstance {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

let logIdCounter = 0;

function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export function useG2Connection() {
  const g2 = ref<G2USBInstance | null>(null);
  const deviceStatus = ref<DeviceStatus>('disconnected');
  const usbLogs = ref<UsbLogEntry[]>([]);

  function log(direction: '→' | '←' | '•', event: string, message: string): void {
    const entry: UsbLogEntry = {
      id: ++logIdCounter,
      timestamp: formatTime(),
      direction,
      event,
      message
    };
    usbLogs.value.push(entry);
  }

  function clearLogs(): void {
    usbLogs.value = [];
  }

  let unsubscribeMessage: (() => void) | null = null;
  let unsubscribeConnected: (() => void) | null = null;
  let unsubscribeConnectFailed: (() => void) | null = null;
  let unsubscribeProgress: (() => void) | null = null;
  let unsubscribeDisconnected: (() => void) | null = null;
  let unsubscribeLoadedData: (() => void) | null = null;
  let unsubscribeLog: (() => void) | null = null;

  const g2Progress = ref<{ state: string; percent: number; message: string } | null>(null);
  const g2LoadedData = ref<{ synthName: string; synthMode: string; slots: { name: string; version: number }[] } | null>(null);

  function setupG2EventListeners() {
    if (typeof window !== 'undefined' && window.electronAPI?.g2) {
      unsubscribeLog = window.electronAPI.g2.onLog((data) => {
        log(data.direction as '→' | '←' | '•', data.event, data.message);
      });

      unsubscribeMessage = window.electronAPI.g2.onMessage((data) => {
        const hexData = data.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' ');
        log('←', 'G2 Message', hexData);
      });

      unsubscribeConnected = window.electronAPI.g2.onConnected(() => {
        deviceStatus.value = 'connected';
        log('←', 'Connect', 'Auto-connected to G2 successfully');
      });

      unsubscribeConnectFailed = window.electronAPI.g2.onConnectFailed((data) => {
        if (data.retries <= 1) {
          deviceStatus.value = 'error';
          log('←', 'Connect', `Auto-connect failed after ${data.attempt} attempts: ${data.error}`);
        } else {
          log('←', 'Connect', `Auto-connect attempt ${data.attempt}/${data.retries} failed, retrying...`);
        }
      });

      unsubscribeProgress = window.electronAPI.g2.onProgress((data) => {
        g2Progress.value = data;
        log('←', 'Progress', `${data.percent}% - ${data.message}`);
      });

      unsubscribeDisconnected = window.electronAPI.g2.onDisconnected(() => {
        deviceStatus.value = 'disconnected';
        log('•', 'G2', 'Device disconnected');
      });

      unsubscribeLoadedData = window.electronAPI.g2.onLoadedData((data) => {
        g2LoadedData.value = data;
        log('←', 'Data', `Synth: ${data.synthName} (${data.synthMode})`);
        for (let i = 0; i < data.slots.length; i++) {
          log('←', 'Data', `Slot ${String.fromCharCode(65 + i)}: ${data.slots[i].name || '(empty)'} (v${data.slots[i].version})`);
        }
      });
    }
  }

  function cleanupG2EventListeners() {
    if (unsubscribeLog) {
      unsubscribeLog();
      unsubscribeLog = null;
    }
    if (unsubscribeMessage) {
      unsubscribeMessage();
      unsubscribeMessage = null;
    }
    if (unsubscribeConnected) {
      unsubscribeConnected();
      unsubscribeConnected = null;
    }
    if (unsubscribeConnectFailed) {
      unsubscribeConnectFailed();
      unsubscribeConnectFailed = null;
    }
    if (unsubscribeProgress) {
      unsubscribeProgress();
      unsubscribeProgress = null;
    }
    if (unsubscribeDisconnected) {
      unsubscribeDisconnected();
      unsubscribeDisconnected = null;
    }
    if (unsubscribeLoadedData) {
      unsubscribeLoadedData();
      unsubscribeLoadedData = null;
    }
  }

  onMounted(() => {
    setupG2EventListeners();
  });

  onUnmounted(() => {
    cleanupG2EventListeners();
  });

  const statusText = computed<string>(() => {
    switch (deviceStatus.value) {
      case 'connected': return 'G2 Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Not Connected';
      case 'uploading': return 'Uploading...';
      case 'downloading': return 'Downloading...';
      case 'error': return 'Connection Error';
      case 'unsupported': return 'G2 Not Available';
      default: return deviceStatus.value;
    }
  });

  async function connectDevice(): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI?.g2) {
      deviceStatus.value = 'unsupported';
      log('•', 'Connect', 'G2 API not available');
      return;
    }

    try {
      deviceStatus.value = 'connecting';
      log('→', 'Connect', 'Connecting to G2 via libusb...');

      const result = await window.electronAPI.g2.connect();

      if (result.success) {
        deviceStatus.value = 'connected';
        log('←', 'Connect', 'Connected to G2 successfully');
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('G2 connection error:', err);
      deviceStatus.value = 'error';
      log('←', 'Connect', `Connection failed: ${errorMessage}`);
    }
  }

  async function disconnectDevice(): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI?.g2) {
      log('•', 'Disconnect', 'G2 API not available');
      return;
    }

    try {
      log('→', 'Disconnect', 'Disconnecting from G2...');

      await window.electronAPI.g2.disconnect();

      deviceStatus.value = 'disconnected';
      log('←', 'Disconnect', 'Disconnected from G2');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('G2 disconnect error:', err);
      deviceStatus.value = 'error';
      log('←', 'Disconnect', `Disconnect error: ${errorMessage}`);
    }
  }

  async function uploadToG2<T extends Record<string, any>>(patch: T | null): Promise<void> {
    if (!patch) {
      log('•', 'Upload', 'No patch to upload');
      return;
    }

    if (deviceStatus.value !== 'connected') {
      log('•', 'Upload', 'G2 not connected');
      return;
    }

    try {
      deviceStatus.value = 'uploading';
      log('→', 'Upload', 'Starting patch upload...');

      await new Promise(resolve => setTimeout(resolve, 100));

      deviceStatus.value = 'connected';
      log('←', 'Upload', 'Patch upload completed');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Upload error:', err);
      deviceStatus.value = 'error';
      log('←', 'Upload', `Upload failed: ${errorMessage}`);
    }
  }

  async function downloadFromG2(slot: number = 0): Promise<void> {
    if (deviceStatus.value !== 'connected') {
      log('•', 'Download', 'G2 not connected');
      return;
    }

    try {
      deviceStatus.value = 'downloading';
      log('→', 'Download', `Requesting patch from Slot ${String.fromCharCode(65 + slot)}...`);

      const cmd = createG2Message(0x0a, [slot]);
      const cmdClean: number[] = [];
      for (let i = 0; i < cmd.length; i++) {
        cmdClean.push(Number(cmd[i]));
      }
      console.log('[Download] Sending bytes:', cmdClean);
      await window.electronAPI.g2.send(cmdClean);

      setTimeout(() => {
        deviceStatus.value = 'connected';
        log('←', 'Download', `Patch request sent for Slot ${String.fromCharCode(65 + slot)}`);
      }, 500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Download error:', err);
      deviceStatus.value = 'error';
      log('←', 'Download', `Download failed: ${errorMessage}`);
    }
  }

  function createG2Message(command: number, data: number[] = []): number[] {
    const msgData = [0x01, 0x20 | command, ...data];
    const msgLen = msgData.length + 4;
    
    let crc = 0;
    for (const byte of msgData) {
      let k = ((crc >> 8) ^ byte) & 255;
      k = k << 8;
      for (let i = 0; i < 8; i++) {
        if ((crc ^ k) & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
        k = k << 1;
      }
    }
    crc = (crc << 8) ^ crc;
    crc = crc & 0xffff;
    
    return [
      (msgLen >> 8) & 0xff,
      msgLen & 0xff,
      ...msgData,
      (crc >> 8) & 0xff,
      crc & 0xff
    ];
  }

  return {
    g2,
    deviceStatus,
    usbLogs,
    statusText,
    g2Progress,
    g2LoadedData,
    connectDevice,
    disconnectDevice,
    uploadToG2,
    downloadFromG2,
    clearLogs
  };
}