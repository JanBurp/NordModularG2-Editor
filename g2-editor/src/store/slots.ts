import type { ModuleInstance, Patch, PatchParamVariation } from '@/types';
import { PATCH_PARAM_KEYS } from '@/types/patch';
import { findConnectedInputCables, findGroupOutputColor } from '../parser/cableGraph';
import { mutAddCable, mutAddModule, mutDeleteCable, mutDeleteModule, mutMoveModule, mutSetModuleColor, mutSetModuleLabel } from '../parser/patchMutations';

import type { Cable } from '@/renderer/cableRenderer';
import type { SlotLabel } from '@/types';
import { defineStore } from 'pinia';
import { resolveColumnCollisions } from './slotHelpers';
import { useDeviceStore } from './device';
import { useUiStore } from './ui';

export type { SlotLabel };

const _paramDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSend(key: string, cmd: string[], delayMs = 80): void {
	const existing = _paramDebounceTimers.get(key);
	if (existing) clearTimeout(existing);
	_paramDebounceTimers.set(
		key,
		setTimeout(() => {
			_paramDebounceTimers.delete(key);
			window.cli.run(cmd);
		}, delayMs),
	);
}

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
		performanceName: '',
		performanceFilePath: '',
		performanceRawHex: null as string | null,
	}),

	getters: {
		isPerformanceMode: (state) => !!state.performanceName,

		getPatchForSlot: (state) => (slot: SlotLabel) => state.slots[slot]?.patch ?? null,

		getPatchName: (state) => (slot: SlotLabel) => state.slots[slot]?.name ?? '',

		getAreaModules: (state) => (slot: SlotLabel, area: 0 | 1) => state.slots[slot]?.patch?.areas?.[area]?.modules ?? [],

		getAreaCables: (state) => (slot: SlotLabel, area: 0 | 1) => state.slots[slot]?.patch?.areas?.[area]?.cableList ?? [],

		getPatchParams: (state) => (slot: SlotLabel) => state.slots[slot]?.patch?.patchParams ?? null,
	},

	actions: {
		async _applyPatchOutput(slot: SlotLabel, output: string): Promise<{ name: string; rawHex: string; patch: Patch }> {
			const result = JSON.parse(output);
			const name: string = result.name;
			const rawHex: string = result.data;

			if (rawHex === this.slots[slot].rawHex && this.slots[slot].patch !== null) {
				return { name, rawHex, patch: this.slots[slot].patch };
			}

			const sectionBytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
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

		_getActivePatch(): { slot: SlotLabel; patch: Patch } | null {
			const slot = useDeviceStore().getActiveSlot ?? useUiStore().activeSlot;
			if (!slot) return null;
			const patch = this.slots[slot].patch;
			return patch ? { slot, patch } : null;
		},

		async selectSlot(slot: SlotLabel): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			if (useDeviceStore().getActiveSlot === slot) return this.loadSlot(slot);

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
			const active = useDeviceStore().getActiveSlot ?? useUiStore().activeSlot;
			if (!active) return;
			await window.cli.run(['variation', String(variation + 1), active]);
		},

		async deleteModule(moduleId: number, area: 'voice' | 'fx'): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			mutDeleteModule(patch, area === 'voice' ? 1 : 0, moduleId);
			this.slots[slot].rawHex = null;

			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run(['del-module', slot, location, String(moduleId)]);

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async moveModuleNoReload(moduleId: number, col: number, row: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			mutMoveModule(patch, area === 'voice' ? 1 : 0, moduleId, col, row);
			this.slots[slot].rawHex = null;

			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run(['move-module', slot, location, String(moduleId), String(col), String(row)]);
		},

		async moveModule(moduleId: number, col: number, row: number, area: 'voice' | 'fx'): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			mutMoveModule(patch, area === 'voice' ? 1 : 0, moduleId, col, row);
			this.slots[slot].rawHex = null;

			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run(['move-module', slot, location, String(moduleId), String(col), String(row)]);

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async addModule(
			typeId: number,
			moduleId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;
			const uiStore = useUiStore();

			const { getModule } = await import('../renderer/nmg2mods');
			const { getParam } = await import('../renderer/parammap');
			const modDef = getModule(typeId);
			const numModes = modDef?.modes?.length ?? 0;
			const modeVals: number[] = Array(numModes).fill(0);
			const numParams = modDef?.params?.length ?? 0;
			const paramVals: number[] = (modDef?.params ?? []).map((p) => getParam(p.type)?.def ?? 64);
			const uname = (modDef?.short ?? 'Module') + moduleId;

			const lv: number[] = Array(numParams * 9);
			for (let v = 0; v < 9; v++) for (let p = 0; p < numParams; p++) lv[v * numParams + p] = paramVals[p] ?? 64;

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

			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run([
				'add-module',
				slot,
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
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			// Enforce output→input direction (source must be output, matching CLI swap logic)
			let smod = fromMod,
				scon = fromCon,
				stype = fromConType;
			let dmod = toMod,
				dcon = toCon,
				dtype = toConType;
			const areaIdx = area === 'voice' ? 1 : 0;
			let dir = 1;
			if (stype === 0 && dtype !== 0) {
				// source is input, dest is output: swap to normalise
				[smod, scon, stype, dmod, dcon, dtype] = [dmod, dcon, dtype, smod, scon, stype];
			} else if (stype === 0 && dtype === 0) {
				// input-to-input: no swap needed
				dir = 0;
			}

			// For input-to-input cables, inherit color from any output already in the connected group
			const effectiveColor = dir === 0 ? findGroupOutputColor(patch.areas[areaIdx].cableList ?? [], smod, scon, dmod, dcon) : color;

			const cable = { colour: effectiveColor, smod, scon, dir, dmod, dcon };
			mutAddCable(patch, areaIdx, cable);
			this.slots[slot].rawHex = null;

			const location = area === 'voice' ? 'va' : 'fx';
			const mainCmd = [
				'add-cable',
				slot,
				location,
				String(effectiveColor),
				String(fromMod),
				String(fromConType),
				String(fromCon),
				String(toMod),
				String(toConType),
				String(toCon),
			];

			// Recolor dir=0 cables in the input group to match an output that was just connected or already present
			const recolorCmds: string[][] = [];
			const recolorGroup = (startMod: number, startCon: number, targetColor: number) => {
				const cableList = patch.areas[areaIdx].cableList ?? [];
				const toRecolor = new Set(findConnectedInputCables(cableList, startMod, startCon).filter((gc) => gc.colour !== targetColor));
				if (toRecolor.size > 0) {
					// Replace cable objects (new array) so Vue's watcher detects the change
					patch.areas[areaIdx].cableList = cableList.map((c) => {
						if (!toRecolor.has(c)) return c;
						const gsmod = c.smod ?? 0,
							gscon = c.scon ?? 0,
							gdmod = c.dmod ?? 0,
							gdcon = c.dcon ?? 0;
						recolorCmds.push(['del-cable', slot, location, String(gsmod), '0', String(gscon), String(gdmod), '0', String(gdcon)]);
						recolorCmds.push([
							'add-cable',
							slot,
							location,
							String(targetColor),
							String(gsmod),
							'0',
							String(gscon),
							String(gdmod),
							'0',
							String(gdcon),
						]);
						return { ...c, colour: targetColor };
					});
				}
			};
			if (dir === 1) {
				recolorGroup(dmod, dcon, effectiveColor);
			} else if (effectiveColor !== color) {
				// Merged two groups; recolor the full connected set (new cable links them)
				recolorGroup(smod, scon, effectiveColor);
			}

			if (recolorCmds.length > 0) {
				await window.cli.runBatch([mainCmd, ...recolorCmds]);
			} else {
				await window.cli.run(mainCmd);
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async setParam(moduleId: number, paramIdx: number, value: number, variation: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const areaIdx = area === 'voice' ? 1 : 0;
			const mod = patch.areas[areaIdx]?.modules?.find((m: any) => m.index === moduleId);
			if (mod?.lv) mod.lv[variation * mod.pcnt + paramIdx] = value;
			this.slots[slot].rawHex = null;

			const location = area === 'voice' ? 'va' : 'fx';
			scheduleSend(`${slot}:${location}:${moduleId}:${paramIdx}:${variation}`, ['set-param', slot, location, String(moduleId), String(paramIdx), String(value), String(variation)]);
		},

		async setMode(moduleId: number, modeIdx: number, value: number, variation: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const areaIdx = area === 'voice' ? 1 : 0;
			const mod = patch.areas[areaIdx]?.modules?.find((m: any) => m.index === moduleId);
			if (mod?.modes) mod.modes[modeIdx] = value;
			this.slots[slot].rawHex = null;

			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run(['set-module-mode', slot, location, String(moduleId), String(modeIdx), String(value)]);
		},

		async loadSlot(slot: SlotLabel): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
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

		loadPatchFile(slot: SlotLabel, patch: Patch, name: string, rawHex?: string, filepath?: string): void {
			this.slots[slot].patch = patch;
			this.slots[slot].name = name;
			if (rawHex) {
				this.slots[slot].rawHex = rawHex;
				this.slots[slot].templateRawHex = rawHex;
			}
			if (filepath) this.slotFilePaths[slot] = filepath;
		},

		loadPerformanceFile(patches: Patch[], slotNames: string[], name: string, rawHex: string, filepath?: string): void {
			const labels: SlotLabel[] = ['A', 'B', 'C', 'D'];
			for (let i = 0; i < 4; i++) {
				const slotName = slotNames[i] || name;
				this.slots[labels[i]].patch = patches[i];
				this.slots[labels[i]].name = slotName;
				// Per-slot rawHex is NOT set — prf2 serialization uses the full performance template
				this.slots[labels[i]].rawHex = null;
				this.slots[labels[i]].templateRawHex = null;
				this.slotFilePaths[labels[i]] = '';
			}
			this.performanceName = name;
			this.performanceRawHex = rawHex;
			this.performanceFilePath = filepath ?? '';
		},

		async savePerformance(filepath?: string): Promise<void> {
			if (!this.performanceRawHex) return;
			let path = filepath || this.performanceFilePath;
			if (!path) {
				//@ts-ignore
				const result = await window.electronAPI.showSavePerfDialog(this.performanceName);
				if (!result.success || !result.filepath) return;
				path = result.filepath;
			}
			const { serializePerformance } = await import('../parser/nmg2PatchSerializer');
			const patches = (['A', 'B', 'C', 'D'] as SlotLabel[]).map((s) => this.slots[s].patch!).filter(Boolean);
			if (patches.length !== 4) return;
			const newRawHex = serializePerformance(patches, this.performanceRawHex);
			const sectionBytes = newRawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
			const nameBytes = Array.from(new TextEncoder().encode(this.performanceName));
			const data = [...nameBytes, 0x00, 0x17, 0x00, ...sectionBytes];
			await window.electronAPI.savePatch(path, data);
			this.performanceFilePath = path;
			this.performanceRawHex = newRawHex;
		},

		async saveSlot(slot: SlotLabel, filepath?: string): Promise<void> {
			const entry = this.slots[slot];
			if (!entry?.patch) return;
			let path = filepath || this.slotFilePaths[slot];
			if (!path) {
				//@ts-ignore
				const result = await window.electronAPI.showSaveDialog(entry.name);
				if (!result.success || !result.filepath) return;
				path = result.filepath;
			}
			if (!entry.rawHex) {
				if (!entry.templateRawHex) return;
				const { serializePatch } = await import('../parser/nmg2PatchSerializer');
				entry.rawHex = serializePatch(entry.name, entry.patch, entry.templateRawHex);
			}
			const sectionBytes = entry.rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
			const nameBytes = Array.from(new TextEncoder().encode(entry.name));
			const data = [...nameBytes, 0x00, 0x17, 0x00, ...sectionBytes];
			await window.electronAPI.savePatch(path, data);
			this.slotFilePaths[slot] = path;
		},

		_resolveColumnCollisions(
			stationaryModules: { index: number; vert: number; height: number }[],
			occupantRects: { row: number; height: number }[],
		): { index: number; newRow: number }[] {
			return resolveColumnCollisions(stationaryModules, occupantRects);
		},

		async moveModulesWithCollision(
			indices: number[],
			dCol: number,
			dRow: number,
			area: 'voice' | 'fx',
			currentModuleList: any[],
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			if (indices.length === 0) return null;
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;
			const { getModule } = await import('../renderer/nmg2mods');
			const areaIdx = area === 'voice' ? 1 : 0;
			const location = area === 'voice' ? 'va' : 'fx';

			const movedSet = new Set(indices);
			const targets = indices
				.map((id) => {
					const m = currentModuleList.find((x: any) => x.index === id);
					if (!m) return null;
					const height = getModule(m.type)?.height ?? 2;
					return {
						index: id,
						fromCol: m.horiz as number,
						fromRow: m.vert as number,
						toCol: Math.max(0, (m.horiz as number) + dCol),
						toRow: Math.max(0, (m.vert as number) + dRow),
						height,
					};
				})
				.filter((t): t is { index: number; fromCol: number; fromRow: number; toCol: number; toRow: number; height: number } => t !== null);

			const occupantsByCol = new Map<number, { row: number; height: number }[]>();
			for (const t of targets) {
				if (!occupantsByCol.has(t.toCol)) occupantsByCol.set(t.toCol, []);
				occupantsByCol.get(t.toCol)!.push({ row: t.toRow, height: t.height });
			}

			const pushDowns: { index: number; col: number; newRow: number }[] = [];
			for (const [col, occupants] of occupantsByCol) {
				const stationary = currentModuleList
					.filter((m: any) => m.horiz === col && !movedSet.has(m.index))
					.map((m: any) => ({
						index: m.index as number,
						vert: m.vert as number,
						height: getModule(m.type)?.height ?? 2,
					}));
				for (const d of this._resolveColumnCollisions(stationary, occupants)) {
					pushDowns.push({ index: d.index, col, newRow: d.newRow });
				}
			}

			for (const p of pushDowns) mutMoveModule(patch, areaIdx, p.index, p.col, p.newRow);
			for (const t of targets) mutMoveModule(patch, areaIdx, t.index, t.toCol, t.toRow);
			this.slots[slot].rawHex = null;

			const cliCmds: string[][] = [
				...pushDowns.map((p) => ['move-module', slot, location, String(p.index), String(p.col), String(p.newRow)]),
				...targets.map((t) => ['move-module', slot, location, String(t.index), String(t.toCol), String(t.toRow)]),
			];
			if (cliCmds.length > 0) await window.cli.runBatch(cliCmds);

			return { name: this.slots[slot].name, rawHex: '', patch };
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
			const height = getModule(typeId)?.height ?? 2;
			const colMods = currentModuleList
				.filter((m: any) => m.horiz === col)
				.map((m: any) => ({
					index: m.index as number,
					vert: m.vert as number,
					height: getModule(m.type)?.height ?? 2,
				}));
			for (const d of this._resolveColumnCollisions(colMods, [{ row, height }])) await this.moveModuleNoReload(d.index, col, d.newRow, area);
			return this.addModule(typeId, moduleId, col, row, area);
		},

		async setModuleColors(moduleIds: number[], color: number, area: 'voice' | 'fx'): Promise<void> {
			if (moduleIds.length === 0) return;
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const areaIdx = area === 'voice' ? 1 : 0;
			const location = area === 'voice' ? 'va' : 'fx';
			for (const id of moduleIds) mutSetModuleColor(patch, areaIdx, id, color);
			this.slots[slot].rawHex = null;
			await window.cli.runBatch(moduleIds.map((id) => ['set-module-color', slot, location, String(id), String(color)]));
		},

		async setModuleLabel(moduleId: number, label: string, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const areaIdx = area === 'voice' ? 1 : 0;
			mutSetModuleLabel(patch, areaIdx, moduleId, label);
			this.slots[slot].rawHex = null;
			const location = area === 'voice' ? 'va' : 'fx';
			await window.cli.run(['set-module-name', slot, location, String(moduleId), label]);
		},

		async setPatchParam(variation: number, key: string, value: number): Promise<void> {
			const slot = useDeviceStore().getActiveSlot ?? useUiStore().activeSlot;
			const params = this.slots[slot]?.patch?.patchParams;
			if (params?.[variation]) {
				(params[variation] as Record<string, number>)[key] = value;
				this.slots[slot].rawHex = null;
			}
			const paramIdx = PATCH_PARAM_KEYS.indexOf(key as keyof PatchParamVariation);
			if (paramIdx < 0) return;
			scheduleSend(`${slot}:patch:2:${paramIdx}:${variation}`, ['set-param', slot, 'patch', '2', String(paramIdx), String(value), String(variation)]);
		},

		async setParamLabel(moduleIndex: number, paramIndex: number, label: string, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const areaIdx = area === 'voice' ? 1 : 0;
			const mod = patch.areas[areaIdx]?.modules?.find((m: any) => m.index === moduleIndex);
			if (!mod) return;
			if (!mod.paramLabels) mod.paramLabels = [];
			let entry = (mod.paramLabels as any[]).find((pl: any) => pl.paramIndex === paramIndex);
			if (!entry) {
				entry = { paramIndex, isString: false, paramLen: 7, labels: [''] };
				(mod.paramLabels as any[]).push(entry);
			}
			entry.labels[0] = label;
			this.slots[slot].rawHex = null;
			// TODO: CLI set-param-label command when available
		},

		async setCableColor(moduleIndex: number, connectorIndex: number, type: 'input' | 'output', color: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const areaIdx = area === 'voice' ? 1 : 0;
			const location = area === 'voice' ? 'va' : 'fx';
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => {
				if (type === 'output') return (c.dir ?? 1) === 1 && c.smod === moduleIndex && c.scon === connectorIndex;
				return (
					((c.dir ?? 1) === 1 && c.dmod === moduleIndex && c.dcon === connectorIndex) ||
					((c.dir ?? 1) === 0 && ((c.smod === moduleIndex && c.scon === connectorIndex) || (c.dmod === moduleIndex && c.dcon === connectorIndex)))
				);
			});
			if (matching.length === 0) return;
			patch.areas[areaIdx].cableList = cableList.map((c) => (matching.includes(c) ? { ...c, colour: color } : c));
			this.slots[slot].rawHex = null;
			await window.cli.runBatch(
				matching.map((c) => [
					'set-cable-color',
					slot,
					location,
					String(color),
					String(c.smod),
					(c.dir ?? 1) === 0 ? '0' : '1',
					String(c.scon),
					String(c.dmod),
					'0',
					String(c.dcon),
				]),
			);
		},

		async deleteConnectedCables(moduleIndex: number, connectorIndex: number, type: 'input' | 'output', area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const areaIdx = area === 'voice' ? 1 : 0;
			const location = area === 'voice' ? 'va' : 'fx';
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => {
				if (type === 'output') return (c.dir ?? 1) === 1 && c.smod === moduleIndex && c.scon === connectorIndex;
				return (
					((c.dir ?? 1) === 1 && c.dmod === moduleIndex && c.dcon === connectorIndex) ||
					((c.dir ?? 1) === 0 && ((c.smod === moduleIndex && c.scon === connectorIndex) || (c.dmod === moduleIndex && c.dcon === connectorIndex)))
				);
			});
			if (matching.length === 0) return;
			for (const c of matching) mutDeleteCable(patch, areaIdx, c);
			this.slots[slot].rawHex = null;
			await window.cli.runBatch(
				matching.map((c) => [
					'del-cable',
					slot,
					location,
					String(c.smod),
					(c.dir ?? 1) === 0 ? '0' : '1',
					String(c.scon),
					String(c.dmod),
					'0',
					String(c.dcon),
				]),
			);
		},

		async deleteSelection(
			selectedModules: number[],
			selectedCables: Cable[],
			area: 'voice' | 'fx',
			currentModuleList: any[],
			currentCableList: any[],
		): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			if (selectedModules.length > 0 && selectedCables.length === 0) {
				const location = area === 'voice' ? 'va' : 'fx';
				const cliCmds: string[][] = [];
				const deletedCableKeys = new Set<string>();
				for (const id of selectedModules) {
					for (const c of currentCableList.filter((c: any) => c.smod === id || c.dmod === id)) {
						const key = `${c.smod}-${c.scon}-${c.dmod}-${c.dcon}`;
						if (!deletedCableKeys.has(key)) {
							deletedCableKeys.add(key);
							mutDeleteCable(patch, area === 'voice' ? 1 : 0, c);
							cliCmds.push([
								'del-cable',
								slot,
								location,
								String(c.smod),
								c.dir === 0 ? '0' : '1',
								String(c.scon),
								String(c.dmod),
								'0',
								String(c.dcon),
							]);
						}
					}
					mutDeleteModule(patch, area === 'voice' ? 1 : 0, id);
					cliCmds.push(['del-module', slot, location, String(id)]);
				}
				this.slots[slot].rawHex = null;
				if (slot && cliCmds.length > 0) await window.cli.runBatch(cliCmds);
				return;
			}
			if (selectedCables.length > 0) {
				const location = area === 'voice' ? 'va' : 'fx';
				const cliCmds: string[][] = [];
				for (const cable of selectedCables) {
					const smod = cable.smod!;
					const scon = cable.scon!;
					const dmod = cable.dmod!;
					const dcon = cable.dcon!;
					mutDeleteCable(patch, area === 'voice' ? 1 : 0, { smod, scon, dmod, dcon });
					cliCmds.push(['del-cable', slot, location, String(smod), cable.dir === 0 ? '0' : '1', String(scon), String(dmod), '0', String(dcon)]);
				}
				this.slots[slot].rawHex = null;
				if (slot && cliCmds.length > 0) await window.cli.runBatch(cliCmds);
			}
		},
	},
});
