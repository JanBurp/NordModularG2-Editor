import { defineStore } from "pinia";
import type { Patch } from "../composables/usePatchManager";
import { useDeviceStore } from "./device";
import type { SlotLabel } from "@/types";

export type { SlotLabel };

interface SlotEntry {
	name: string;
	loading: boolean;
	error: string | null;
	rawHex: string | null;
	patch: Patch | null;
}

export const useSlotsStore = defineStore("slots", {
	state: () => ({
		slots: {
			A: { name: "", loading: false, error: null, rawHex: null, patch: null },
			B: { name: "", loading: false, error: null, rawHex: null, patch: null },
			C: { name: "", loading: false, error: null, rawHex: null, patch: null },
			D: { name: "", loading: false, error: null, rawHex: null, patch: null },
		} as Record<SlotLabel, SlotEntry>,
	}),

	actions: {
		async _applyPatchOutput(
			slot: SlotLabel,
			output: string,
		): Promise<{ name: string; rawHex: string; patch: Patch }> {
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
			const { PatchParser } = await import("../parser/nmg2PatchParser");
			const patch = new PatchParser(pch2.buffer).parse() as Patch;

			this.slots[slot].name = name;
			this.slots[slot].rawHex = rawHex;
			this.slots[slot].patch = patch;
			return { name, rawHex, patch };
		},

		async selectSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			if (useDeviceStore().getActiveSlot === slot) return this.loadSlot(slot);

			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const [, patchOutput] = await window.cli.runBatch([
					["slot", slot],
					["get-patch", slot],
				]);
				useDeviceStore().setActiveSlot(slot);
				return await this._applyPatchOutput(slot, patchOutput);
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},

		async selectVariation(variation: number): Promise<void> {
			const active = useDeviceStore().getActiveSlot;
			if (!active) return;
			await window.cli.run(["variation", String(variation + 1), active]);
		},

		async loadSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const output = await window.cli.run(["get-patch", slot]);
				return await this._applyPatchOutput(slot, output);
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},
	},
});
