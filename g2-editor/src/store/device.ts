import { defineStore } from 'pinia'
import { Settings } from '@/types'

declare global {
  interface Window {
    cli: {
      run(args: string[]): Promise<string>
    }
  }
}

export const useDeviceStore = defineStore('device', {
  state: () => ({
    connected: false,
    deviceName: '',
    settings: null as Settings | null
  }),

  actions: {
    async connect() {
      try {
        await window.cli.run(['connect'])
        this.connected = true
        this.deviceName = 'Nord G2'
      } catch (e: any) {
        throw new Error(`Failed to connect: ${e.message}`)
      }
    },

    async fetchSettings() {
      if (!this.connected) throw new Error('Not connected')
      const output = await window.cli.run(['settings'])
      this.settings = JSON.parse(output)
    }
  }
})