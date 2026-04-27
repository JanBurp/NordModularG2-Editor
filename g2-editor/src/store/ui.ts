import { defineStore } from "pinia";
import { ref } from "vue";
import type { SlotLabel } from "@/types";

export type PaneTab = "modules" | "browser" | "usb";

export const useUiStore = defineStore("ui", () => {
  const activeSlot = ref<SlotLabel>("A");
  const area = ref<0 | 1>(1);
  const variation = ref(0);

  const rightPaneTab = ref<PaneTab>("modules");
  const showRightPane = ref<boolean>(true);

  function toggleSidebar(tab: PaneTab): void {
    if (rightPaneTab.value === tab) {
      showRightPane.value = !showRightPane.value;
    } else {
      rightPaneTab.value = tab;
      showRightPane.value = true;
    }
  }

  return { activeSlot, area, variation, rightPaneTab, showRightPane, toggleSidebar };
});