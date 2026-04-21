import { ref } from 'vue'
import { useDeviceStore } from '@/store/device'

export function useG2() {
  const store = useDeviceStore()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function connect() {
    loading.value = true
    error.value = null
    try {
      await store.connect()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSettings() {
    loading.value = true
    error.value = null
    try {
      await store.fetchSettings()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    device: store,
    connect,
    fetchSettings
  }
}