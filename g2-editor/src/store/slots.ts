import { defineStore } from "pinia";
import type { Patch } from "../parser/nmg2PatchParser";
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
		activeSlot: "A" as SlotLabel,
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
			patch.mode = { area: 1, variation: patch.description?.variation ?? 0 };
			return { name, rawHex, patch };
		},

		async selectSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.activeSlot = slot;
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

		async deleteCable(
			cable: { smod: number; scon: number; dmod: number; dcon: number },
			area: "voice" | "fx",
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return null;
			const location = area === "voice" ? "va" : "fx";
			await window.cli.run([
				"del-cable", slot, location,
				String(cable.smod), "1", String(cable.scon),
				String(cable.dmod), "0", String(cable.dcon),
			]);
			return this.loadSlot(slot);
		},

		async deleteCableNoReload(
			cable: { smod: number; scon: number; dmod: number; dcon: number },
			area: "voice" | "fx",
		): Promise<void> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return;
			const location = area === "voice" ? "va" : "fx";
			await window.cli.run([
				"del-cable", slot, location,
				String(cable.smod), "1", String(cable.scon),
				String(cable.dmod), "0", String(cable.dcon),
			]);
		},

		async deleteModule(
			moduleId: number,
			area: "voice" | "fx",
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return null;
			const location = area === "voice" ? "va" : "fx";
			await window.cli.run(["del-module", slot, location, String(moduleId)]);
			return this.loadSlot(slot);
		},

		async moveModuleNoReload(
			moduleId: number,
			col: number,
			row: number,
			area: "voice" | "fx",
		): Promise<void> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return;
			const location = area === "voice" ? "va" : "fx";
			await window.cli.run(["move-module", slot, location, String(moduleId), String(col), String(row)]);
		},

		async moveModule(
			moduleId: number,
			col: number,
			row: number,
			area: "voice" | "fx",
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return null;
			const location = area === "voice" ? "va" : "fx";
			await window.cli.run(["move-module", slot, location, String(moduleId), String(col), String(row)]);
			return this.loadSlot(slot);
		},

		async addModule(
			typeId: number,
			moduleId: number,
			col: number,
			row: number,
			area: "voice" | "fx",
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return null;
			const location = area === "voice" ? "va" : "fx";
			const { getModule } = await import("../renderer/nmg2mods");
			const { getParam } = await import("../renderer/parammap");
			const modDef = getModule(typeId) as any;
			const numModes = modDef?.modes?.length ?? 0;
			const modeVals: number[] = Array(numModes).fill(0);
			const numParams = modDef?.params?.length ?? 0;
			const paramVals: number[] = (modDef?.params ?? []).map((p: any) => getParam(p.type)?.def ?? 64);
			const name = (modDef?.short ?? "Module") + moduleId;
			await window.cli.run([
				"add-module", slot, location,
				String(typeId), String(moduleId), String(col), String(row),
				String(numModes), ...modeVals.map(String),
				String(numParams), ...paramVals.map(String),
				name,
			]);
			return this.loadSlot(slot);
		},

		async addCable(
			fromMod: number, fromConType: number, fromCon: number,
			toMod: number, toConType: number, toCon: number,
			area: "voice" | "fx",
			color = 1,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return null;
			const location = area === "voice" ? "va" : "fx";
			await window.cli.run([
				"add-cable", slot, location, String(color),
				String(fromMod), String(fromConType), String(fromCon),
				String(toMod), String(toConType), String(toCon),
			]);
			return this.loadSlot(slot);
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

		loadPatchFile(slot: SlotLabel, patch: Patch, name: string): void {
			this.slots[slot].patch = patch;
			this.slots[slot].name = name;
		},
	},
});
