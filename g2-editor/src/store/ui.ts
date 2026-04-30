import type { Cable } from "@/renderer/cableRenderer";
import { SLOT_LABELS } from "@/constants";
import type { SlotLabel } from "@/types";
import { defineStore } from "pinia";
import { useDeviceStore } from "./device";

export type PaneTab = "modules" | "browser";

export const useUiStore = defineStore("ui", {
  state: () => ({
    activeSlot: "A" as SlotLabel,
    area: 1 as number,
    variation: 0 as number,
    moduleColor: 0 as number,
    rightPaneTab: "modules" as PaneTab,
    showRightPane: true as boolean,
    selectedCable: null as Cable | null,
    selectedModule: null as number | -1 | null,
  }),

  getters: {

    selectedSlotIndex: (state) => {
      const label = useDeviceStore().getActiveSlot;
      return SLOT_LABELS.indexOf((label ?? state.activeSlot) as SlotLabel);
    },

  },

  actions: {

    toggleSidebar(tab: PaneTab) {
      if (this.rightPaneTab === tab) {
        this.showRightPane = !this.showRightPane;
      } else {
        this.rightPaneTab = tab;
        this.showRightPane = true;
      }
    },

    setModuleColor(index: number) {
      this.moduleColor = index;
    }

  },
});
