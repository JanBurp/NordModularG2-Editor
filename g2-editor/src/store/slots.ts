import { defineStore } from "pinia";
import type { Patch } from "../composables/usePatchManager";

export type SlotLabel = "A" | "B" | "C" | "D";

interface SlotEntry {
	name: string;
	loading: boolean;
	error: string | null;
	rawHex: string | null;
	patch: Patch | null;
}

export const useSlotsStore = defineStore("slots", {
	state: () => ({
		selected: null as SlotLabel | null,
		slots: {
			A: { name: "", loading: false, error: null, rawHex: null, patch: null },
			B: { name: "", loading: false, error: null, rawHex: null, patch: null },
			C: { name: "", loading: false, error: null, rawHex: null, patch: null },
			D: { name: "", loading: false, error: null, rawHex: null, patch: null },
		} as Record<SlotLabel, SlotEntry>,
	}),

	actions: {
		async loadSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.selected = slot;
			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const output = await window.cli.run(["get-patch", slot]);
				const result = JSON.parse(output);
				const name: string = result.name;
				const rawHex: string = result.data;

				const sectionBytes = new Uint8Array(
					rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
				);
				const nameBytes = new TextEncoder().encode(name);
				const header = new Uint8Array(nameBytes.length + 3);
				header.set(nameBytes);
				header[nameBytes.length] = 0x00;
				header[nameBytes.length + 1] = 0x17;
				header[nameBytes.length + 2] = 0x00;
				const pch2 = new Uint8Array(header.length + sectionBytes.length);
				pch2.set(header, 0);
				pch2.set(sectionBytes, header.length);
				const { PatchParser } = await import(
					"../parser/nmg2PatchParser.js"
				);
				const patch = new PatchParser(pch2.buffer).parse() as Patch;

				this.slots[slot].name = name;
				this.slots[slot].rawHex = rawHex;
				this.slots[slot].patch = patch;
				return { name, rawHex, patch };
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},
	},
});
