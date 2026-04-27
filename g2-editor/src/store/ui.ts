import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SlotLabel } from "@/types";
import type { Cable } from "@/renderer/cableRenderer";
import { useDeviceStore } from "./device";
import { SLOT_LABELS } from "@/constants";

export type PaneTab = "modules" | "browser" | "usb";

export const useUiStore = defineStore("ui", () => {
  const activeSlot = ref<SlotLabel>("A");
  const area = ref<0 | 1>(1);
  const variation = ref(0);

  const rightPaneTab = ref<PaneTab>("modules");
  const showRightPane = ref<boolean>(true);

  const selectedCable = ref<Cable | null>(null);
  const selectedModule = ref<number | -1 | null>(null);

  const selectedSlotIndex = computed<number | null>(() => {
    const label = useDeviceStore().getActiveSlot;
    return SLOT_LABELS.indexOf((label ?? activeSlot.value) as SlotLabel);
  });

  function toggleSidebar(tab: PaneTab): void {
    if (rightPaneTab.value === tab) {
      showRightPane.value = !showRightPane.value;
    } else {
      rightPaneTab.value = tab;
      showRightPane.value = true;
    }
  }

  return { activeSlot, area, variation, rightPaneTab, showRightPane, toggleSidebar,
           selectedCable, selectedModule, selectedSlotIndex };
});