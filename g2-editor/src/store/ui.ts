import { defineStore } from "pinia";
import { ref } from "vue";
import type { SlotLabel } from "@/types";

export const useUiStore = defineStore("ui", () => {
  const activeSlot = ref<SlotLabel>("A");
  const area = ref<0 | 1>(1);
  const variation = ref(0);

  return { activeSlot, area, variation };
});