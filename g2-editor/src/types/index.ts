export interface SlotInfo {
  variation: number
  name: string
}

export interface Slots {
  A: SlotInfo | null
  B: SlotInfo | null
  C: SlotInfo | null
  D: SlotInfo | null
}

export interface Settings {
  slots: Slots
  bank: number
  program: number
  masterClock: { tempo: number; running: boolean }
  midiIn: { channel: number; softThru: boolean }
}

export interface DeviceState {
  connected: boolean
  deviceName: string
  settings: Settings | null
}