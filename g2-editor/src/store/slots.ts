import { defineStore } from "pinia";

export type SlotLabel = "A" | "B" | "C" | "D";

interface SlotEntry {
	name: string;
	loading: boolean;
	error: string | null;
	rawHex: string | null;
}

export const useSlotsStore = defineStore("slots", {
	state: () => ({
		selected: null as SlotLabel | null,
		slots: {
			A: { name: "", loading: false, error: null, rawHex: null },
			B: { name: "", loading: false, error: null, rawHex: null },
			C: { name: "", loading: false, error: null, rawHex: null },
			D: { name: "", loading: false, error: null, rawHex: null },
		} as Record<SlotLabel, SlotEntry>,
	}),

	actions: {
		async loadSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string } | null> {
			this.selected = slot;
			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const output = await window.cli.run(["get-patch", slot]);
				const result = JSON.parse(output);
				this.slots[slot].name = result.name;
				this.slots[slot].rawHex = result.data;
				return { name: result.name, rawHex: result.data };
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},
	},
});
