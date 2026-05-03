import type { ModuleInstance, Patch } from '../parser/nmg2PatchParser';
import {
	mutAddCable,
	mutAddModule,
	mutDeleteCable,
	mutDeleteModule,
	mutMoveModule,
	mutSetModuleColor,
	mutSetModuleLabel,
} from '../parser/patchMutations';

import type { SlotLabel } from '@/types';
import { defineStore } from 'pinia';
import { useDeviceStore } from './device';
import { useUiStore } from './ui';

export type { SlotLabel };

interface SlotEntry {
	name: string;
	loading: boolean;
	error: string | null;
	rawHex: string | null;
	templateRawHex: string | null; // last valid rawHex from hardware/file; never cleared
	patch: Patch | null;
}

export const useSlotsStore = defineStore('slots', {
	state: () => ({
		activeSlot: 'A' as SlotLabel,
		slotFilePaths: {
			A: '',
			B: '',
			C: '',
			D: '',
		} as Record<SlotLabel, string>,
		slots: {
			A: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
			},
			B: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
			},
			C: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
			},
			D: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
			},
		} as Record<SlotLabel, SlotEntry>,
	}),

	getters: {
		getPatchForSlot: (state) => (slot: SlotLabel) =>
			state.slots[slot]?.patch ?? null,

		getPatchName: (state) => (slot: SlotLabel) =>
			state.slots[slot]?.name ?? '',

		getAreaModules: (state) => (slot: SlotLabel, area: 0 | 1) =>
			state.slots[slot]?.patch?.areas?.[area]?.modules ?? [],

		getAreaCables: (state) => (slot: SlotLabel, area: 0 | 1) =>
			state.slots[slot]?.patch?.areas?.[area]?.cableList ?? [],
	},

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
			const { PatchParser } = await import('../parser/nmg2PatchParser');
			const patch = new PatchParser(pch2.buffer).parse() as Patch;

			this.slots[slot].name = name;
			this.slots[slot].rawHex = rawHex;
			this.slots[slot].templateRawHex = rawHex;
			this.slots[slot].patch = patch;
			patch.mode = {
				area: 1,
				variation: patch.description?.variation ?? 0,
			};
			return { name, rawHex, patch };
		},

		async selectSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.activeSlot = slot;
			if (useDeviceStore().getActiveSlot === slot)
				return this.loadSlot(slot);

			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const [, patchOutput] = await window.cli.runBatch([
					['slot', slot],
					['get-patch', slot],
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
			await window.cli.run(['variation', String(variation + 1), active]);
		},

		async deleteCable(
			cable: { smod: number; scon: number; dmod: number; dcon: number },
			area: 'voice' | 'fx',
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return null;

			mutDeleteCable(patch, area === 'voice' ? 1 : 0, cable);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'del-cable',
					deviceSlot,
					location,
					String(cable.smod),
					'1',
					String(cable.scon),
					String(cable.dmod),
					'0',
					String(cable.dcon),
				]);
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async deleteCableNoReload(
			cable: { smod: number; scon: number; dmod: number; dcon: number },
			area: 'voice' | 'fx',
		): Promise<void> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return;

			mutDeleteCable(patch, area === 'voice' ? 1 : 0, cable);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'del-cable',
					deviceSlot,
					location,
					String(cable.smod),
					'1',
					String(cable.scon),
					String(cable.dmod),
					'0',
					String(cable.dcon),
				]);
			}
		},

		async deleteModule(
			moduleId: number,
			area: 'voice' | 'fx',
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return null;

			mutDeleteModule(patch, area === 'voice' ? 1 : 0, moduleId);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'del-module',
					deviceSlot,
					location,
					String(moduleId),
				]);
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async moveModuleNoReload(
			moduleId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
		): Promise<void> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return;

			mutMoveModule(patch, area === 'voice' ? 1 : 0, moduleId, col, row);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'move-module',
					deviceSlot,
					location,
					String(moduleId),
					String(col),
					String(row),
				]);
			}
		},

		async moveModule(
			moduleId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return null;

			mutMoveModule(patch, area === 'voice' ? 1 : 0, moduleId, col, row);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'move-module',
					deviceSlot,
					location,
					String(moduleId),
					String(col),
					String(row),
				]);
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async addModule(
			typeId: number,
			moduleId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const uiStore = useUiStore();
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return null;

			const { getModule } = await import('../renderer/nmg2mods');
			const { getParam } = await import('../renderer/parammap');
			const modDef = getModule(typeId) as any;
			const numModes = modDef?.modes?.length ?? 0;
			const modeVals: number[] = Array(numModes).fill(0);
			const numParams = modDef?.params?.length ?? 0;
			const paramVals: number[] = (modDef?.params ?? []).map(
				(p: any) => getParam(p.type)?.def ?? 64,
			);
			const uname = (modDef?.short ?? 'Module') + moduleId;

			const lv: number[] = Array(numParams * 9);
			for (let v = 0; v < 9; v++)
				for (let p = 0; p < numParams; p++)
					lv[v * numParams + p] = paramVals[p] ?? 64;

			const mod: ModuleInstance = {
				type: typeId,
				index: moduleId,
				horiz: col,
				vert: row,
				colour: uiStore.moduleColor,
				uprate: 0,
				leds: 0,
				pcnt: numParams,
				lv,
				modes: modeVals,
				uname,
			};

			mutAddModule(patch, area === 'voice' ? 1 : 0, mod);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'add-module',
					deviceSlot,
					location,
					String(typeId),
					String(moduleId),
					String(col),
					String(row),
					String(mod.colour),
					String(numModes),
					...modeVals.map(String),
					String(numParams),
					...paramVals.map(String),
					uname,
				]);
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async addCable(
			fromMod: number,
			fromConType: number,
			fromCon: number,
			toMod: number,
			toConType: number,
			toCon: number,
			area: 'voice' | 'fx',
			color = 1,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return null;

			// Enforce output→input direction (source must be output, matching CLI swap logic)
			let smod = fromMod,
				scon = fromCon,
				stype = fromConType;
			let dmod = toMod,
				dcon = toCon,
				dtype = toConType;
			if (stype === 0) {
				// source is input, swap
				[smod, scon, stype, dmod, dcon, dtype] = [
					dmod,
					dcon,
					dtype,
					smod,
					scon,
					stype,
				];
			}

			const cable = { colour: color, smod, scon, dir: 1, dmod, dcon };
			mutAddCable(patch, area === 'voice' ? 1 : 0, cable);
			this.slots[slot].rawHex = null;

			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'add-cable',
					deviceSlot,
					location,
					String(color),
					String(fromMod),
					String(fromConType),
					String(fromCon),
					String(toMod),
					String(toConType),
					String(toCon),
				]);
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async setParam(
			moduleId: number,
			paramIdx: number,
			value: number,
			variation: number,
			area: 'voice' | 'fx',
		): Promise<void> {
			const slot = useDeviceStore().getActiveSlot;
			if (!slot) return;
			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run([
				'set-param',
				slot,
				location,
				String(moduleId),
				String(paramIdx),
				String(value),
				String(variation),
			]);
		},

		async loadSlot(
			slot: SlotLabel,
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const output = await window.cli.run(['get-patch', slot]);
				return await this._applyPatchOutput(slot, output);
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},

		loadPatchFile(
			slot: SlotLabel,
			patch: Patch,
			name: string,
			rawHex?: string,
			filepath?: string,
		): void {
			this.slots[slot].patch = patch;
			this.slots[slot].name = name;
			if (rawHex) {
				this.slots[slot].rawHex = rawHex;
				this.slots[slot].templateRawHex = rawHex;
			}
			if (filepath) this.slotFilePaths[slot] = filepath;
		},

		async saveSlot(slot: SlotLabel, filepath?: string): Promise<void> {
			const entry = this.slots[slot];
			if (!entry?.patch) return;
			const path = filepath || this.slotFilePaths[slot];
			if (!path) return;
			if (!entry.rawHex) {
				if (!entry.templateRawHex) return;
				const { serializePatch } =
					await import('../parser/nmg2PatchSerializer');
				entry.rawHex = serializePatch(
					entry.name,
					entry.patch,
					entry.templateRawHex,
				);
			}
			const sectionBytes = entry.rawHex
				.match(/.{2}/g)!
				.map((b) => parseInt(b, 16));
			const nameBytes = Array.from(new TextEncoder().encode(entry.name));
			const data = [...nameBytes, 0x00, 0x17, 0x00, ...sectionBytes];
			await window.electronAPI.savePatch(path, data);
			this.slotFilePaths[slot] = path;
		},

		_resolveColumnCollisions(
			colModules: { index: number; vert: number; height: number }[],
			targetRow: number,
			targetHeight: number,
		): { index: number; newRow: number }[] {
			const sorted = [...colModules].sort((a, b) => a.vert - b.vert);
			const newRows = new Map(sorted.map((m) => [m.index, m.vert]));
			let floor = targetRow + targetHeight;
			for (const mod of sorted) {
				const r = newRows.get(mod.index)!;
				if (r + mod.height <= targetRow) continue;
				if (r < floor) {
					newRows.set(mod.index, floor);
					floor += mod.height;
				} else {
					floor = r + mod.height;
				}
			}
			return sorted
				.filter((m) => newRows.get(m.index) !== m.vert)
				.map((m) => ({
					index: m.index,
					newRow: newRows.get(m.index)!,
				}));
		},

		async moveModuleWithCollision(
			moduleIndex: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
			currentModuleList: any[],
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const mod = currentModuleList.find(
				(m: any) => m.index === moduleIndex,
			);
			if (!mod) return null;
			const { getModule } = await import('../renderer/nmg2mods');
			const height = (getModule(mod.type) as any)?.height ?? 2;
			const colMods = currentModuleList
				.filter((m: any) => m.horiz === col && m.index !== moduleIndex)
				.map((m: any) => ({
					index: m.index as number,
					vert: m.vert as number,
					height: ((getModule(m.type) as any)?.height ?? 2) as number,
				}));
			for (const d of this._resolveColumnCollisions(colMods, row, height))
				await this.moveModuleNoReload(d.index, col, d.newRow, area);
			return this.moveModule(moduleIndex, col, row, area);
		},

		async dropModuleWithCollision(
			typeId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
			currentModuleList: any[],
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const { getModule } = await import('../renderer/nmg2mods');
			const ids = currentModuleList.map((m: any) => m.index as number);
			const moduleId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
			const height = (getModule(typeId) as any)?.height ?? 2;
			const colMods = currentModuleList
				.filter((m: any) => m.horiz === col)
				.map((m: any) => ({
					index: m.index as number,
					vert: m.vert as number,
					height: ((getModule(m.type) as any)?.height ?? 2) as number,
				}));
			for (const d of this._resolveColumnCollisions(colMods, row, height))
				await this.moveModuleNoReload(d.index, col, d.newRow, area);
			return this.addModule(typeId, moduleId, col, row, area);
		},

		async setModuleColors(
			moduleIds: number[],
			color: number,
			area: 'voice' | 'fx',
		): Promise<void> {
			if (moduleIds.length === 0) return;
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return;
			const areaIdx = area === 'voice' ? 1 : 0;
			const location = area === 'voice' ? 'va' : 'fx';
			for (const id of moduleIds)
				mutSetModuleColor(patch, areaIdx, id, color);
			this.slots[slot].rawHex = null;
			if (deviceSlot) {
				const cliCmds = moduleIds.map(
					(id) =>
						`set-module-color ${deviceSlot} ${location} ${id} ${color}`,
				);
				await window.cli.run(['seq', ...cliCmds]);
			}
		},

		async setModuleLabel(
			moduleId: number,
			label: string,
			area: 'voice' | 'fx',
		): Promise<void> {
			const deviceSlot = useDeviceStore().getActiveSlot;
			const slot = deviceSlot ?? this.activeSlot;
			const patch = this.slots[slot].patch;
			if (!patch) return;
			const areaIdx = area === 'voice' ? 1 : 0;
			mutSetModuleLabel(patch, areaIdx, moduleId, label);
			this.slots[slot].rawHex = null;
			if (deviceSlot) {
				const location = area === 'voice' ? 'va' : 'fx';
				await window.cli.run([
					'set-module-name',
					deviceSlot,
					location,
					String(moduleId),
					label,
				]);
			}
		},

		async deleteSelection(
			selectedModules: number[],
			selectedCable: {
				smod?: number;
				scon?: number;
				dmod?: number;
				dcon?: number;
			} | null,
			area: 'voice' | 'fx',
			currentModuleList: any[],
			currentCableList: any[],
		): Promise<void> {
			if (selectedModules.length > 0 && !selectedCable) {
				const deviceSlot = useDeviceStore().getActiveSlot;
				const slot = deviceSlot ?? this.activeSlot;
				const patch = this.slots[slot].patch;
				if (!patch) return;
				const location = area === 'voice' ? 'va' : 'fx';
				const cliCmds: string[] = [];
				const deletedCableKeys = new Set<string>();
				for (const id of selectedModules) {
					for (const c of currentCableList.filter(
						(c: any) => c.smod === id || c.dmod === id,
					)) {
						const key = `${c.smod}-${c.scon}-${c.dmod}-${c.dcon}`;
						if (!deletedCableKeys.has(key)) {
							deletedCableKeys.add(key);
							mutDeleteCable(patch, area === 'voice' ? 1 : 0, c);
							if (deviceSlot)
								cliCmds.push(
									`del-cable ${deviceSlot} ${location} ${c.smod} 1 ${c.scon} ${c.dmod} 0 ${c.dcon}`,
								);
						}
					}
					mutDeleteModule(patch, area === 'voice' ? 1 : 0, id);
					if (deviceSlot)
						cliCmds.push(
							`del-module ${deviceSlot} ${location} ${id}`,
						);
				}
				this.slots[slot].rawHex = null;
				if (deviceSlot && cliCmds.length > 0)
					await window.cli.run(['seq', ...cliCmds]);
				return;
			}
			if (selectedCable)
				await this.deleteCable(
					{
						smod: selectedCable.smod!,
						scon: selectedCable.scon!,
						dmod: selectedCable.dmod!,
						dcon: selectedCable.dcon!,
					},
					area,
				);
		},
	},
});
