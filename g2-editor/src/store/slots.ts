import type { ModuleInstance, Patch, PatchParamVariation, VariationState } from '@/types';
import { PATCH_PARAM_KEYS } from '@/types/patch';
import { findConnectedInputCables, findGroupOutputColor } from '../parser/cableGraph';
import { mutAddCable, mutAddModule, mutDeleteCable, mutDeleteModule, mutMoveModule, mutSetModuleColor, mutSetModuleLabel } from '../parser/patchMutations';

import type { Cable } from '@/renderer/cableRenderer';
import type { SlotLabel } from '@/types';
import { defineStore } from 'pinia';
import { areaConfig, findModuleByIndex, matchesCableJack, resolveColumnCollisions, extractVariations, removeModuleFromVariations } from './slotHelpers';
import { DeviceStatus, useDeviceStore } from './device';
import { useUiStore } from './ui';
import { useHistoryStore } from './history';

type ResourceMetrics = { cycles: number; memory: number };
export type SlotResources = { va: ResourceMetrics; fx: ResourceMetrics };

function emptySlotResources(): SlotResources {
	return { va: { cycles: 0, memory: 0 }, fx: { cycles: 0, memory: 0 } };
}

// d is the bulk payload. Each block: d[o]=location, d[o+1..o+27]=TPatchLoadData (Delphi indices +1).
// Compound packets pack both areas: block0 at offset 0, 0x72 marker at offset 28, block1 at offset 29.
function parseResourceCycles(d: number[], o: number): number {
	const red1 = d[o + 2] + d[o + 1] * 128;
	const blue1 = d[o + 4] + d[o + 3] * 128;
	return Math.max(100 * red1 / 1372 + 100 * blue1 / 5000, 0);
}

function parseResourceMemory(d: number[], o: number): number {
	const internalMem = d[o + 5];
	const resource4 = d[o + 9] + d[o + 8] * 128;
	const ram = d[o + 22] * 16777216 + d[o + 23] * 65536 + d[o + 24] * 256 + d[o + 25];
	return Math.max(Math.max(100 * internalMem / 128, 100 * ram / 260000), 100 * resource4 / 4315);
}

export type { SlotLabel };

const BATCH_CHUNK = 128;

const _paramDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSend(key: string, cmd: string[], delayMs = 80): void {
	const existing = _paramDebounceTimers.get(key);
	if (existing) clearTimeout(existing);
	_paramDebounceTimers.set(
		key,
		setTimeout(() => {
			_paramDebounceTimers.delete(key);
			window.cli.run(cmd).catch((err: unknown) => console.error('scheduleSend failed:', err));
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
	variations: VariationState[] | null; // 9 elements (0-8); null when no patch loaded
	resources: SlotResources;
	assignedVoices: number;
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
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
			},
			B: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
			},
			C: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
			},
			D: {
				name: '',
				loading: false,
				error: null,
				rawHex: null,
				templateRawHex: null,
				patch: null,
				variations: null,
				resources: emptySlotResources(),
				assignedVoices: 0,
			},
		} as Record<SlotLabel, SlotEntry>,
		performanceName: '',
		performanceFilePath: '',
		performanceRawHex: null as string | null,
		uploadingFromFile: false,
	}),

	getters: {
		isPerformanceMode: (state) => !!state.performanceName,

		getPatchForSlot: (state) => (slot: SlotLabel) => state.slots[slot]?.patch ?? null,

		getPatchName: (state) => (slot: SlotLabel) => state.slots[slot]?.name ?? '',

		getAreaModules: (state) => (slot: SlotLabel, area: 0 | 1) => state.slots[slot]?.patch?.areas?.[area]?.modules ?? [],

		getAreaCables: (state) => (slot: SlotLabel, area: 0 | 1) => state.slots[slot]?.patch?.areas?.[area]?.cableList ?? [],

		getPatchParams: (state) => (slot: SlotLabel) => state.slots[slot]?.variations?.map((v) => v.patch) ?? null,

		getVariations: (state) => (slot: SlotLabel) => state.slots[slot]?.variations ?? null,

		activeSlotResources: (state): SlotResources => state.slots[useUiStore().slotInFocus].resources,

		assignedVoicesForSlot: (state) => (slot: SlotLabel): number => state.slots[slot].assignedVoices,
	},

	actions: {
		async _applyPatchOutput(slot: SlotLabel, output: string): Promise<{ name: string; rawHex: string; patch: Patch }> {
			const result = JSON.parse(output);
			const name: string = result.name;
			const rawHex: string = result.data;

			if (rawHex === this.slots[slot].rawHex && this.slots[slot].patch !== null) {
				return { name, rawHex, patch: this.slots[slot].patch };
			}

			const hexPairs = rawHex.match(/.{2}/g);
			if (!hexPairs) throw new Error(`Invalid patch hex for slot ${slot}`);
			const sectionBytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)));
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
			this.slots[slot].variations = extractVariations(patch);
			patch.mode = {
				area: 1,
				variation: patch.description?.variation ?? 0,
			};
			useHistoryStore().clearHistory(slot);
			return { name, rawHex, patch };
		},

		_getActivePatch(): { slot: SlotLabel; patch: Patch } | null {
			const slot = useUiStore().slotInFocus;
			if (!slot) return null;
			const patch = this.slots[slot].patch;
			return patch ? { slot, patch } : null;
		},

		async selectSlot(slot: SlotLabel): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const hasPatch = !!this.slots[slot].patch;
			this.slots[slot].loading = !hasPatch;
			this.slots[slot].error = null;
			try {
				if (hasPatch) {
					await window.cli.run(['slot', slot]);
					return null;
				}
				const [, patchOutput] = await window.cli.runBatch([
					['slot', slot],
					['get-patch', slot],
				]);
				return await this._applyPatchOutput(slot, patchOutput);
			} catch (e: any) {
				this.slots[slot].error = e.message;
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},

		async selectVariation(variation: number): Promise<void> {
			const active = useUiStore().slotInFocus;
			if (!active) return;
			await window.cli.run(['variation', String(variation + 1), active]);
		},

		async deleteModule(moduleId: number, area: 'voice' | 'fx'): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];
			const hist = useHistoryStore();

			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx].modules, moduleId);
				if (mod) {
					const pcnt = mod.pcnt;
					const numVar = slotEntry.variations?.length ?? 1;
					const lvSnap = Array(pcnt * numVar).fill(0);
					for (let v = 0; v < numVar; v++) {
						const varParams = slotEntry.variations?.[v]?.[areaKey]?.[moduleId] ?? [];
						for (let p = 0; p < pcnt; p++) lvSnap[v * pcnt + p] = varParams[p] ?? 0;
					}
					const modSnap = { ...mod, lv: lvSnap, modes: [...mod.modes] };
					const cableSnap = (patch.areas[areaIdx].cableList ?? [])
						.filter((c) => c.smod === moduleId || c.dmod === moduleId)
						.map((c) => ({ ...c }));
					hist.record(slot, {
						undo: async () => {
							mutAddModule(patch, areaIdx, { ...modSnap, lv: [...modSnap.lv], modes: [...modSnap.modes] });
							const slotE = this.slots[slot];
							if (slotE.variations) {
								for (let v = 0; v < slotE.variations.length; v++) {
									const start = v * modSnap.pcnt;
									slotE.variations[v][areaKey][moduleId] = modSnap.lv.slice(start, start + modSnap.pcnt);
								}
							}
							for (const c of cableSnap) mutAddCable(patch, areaIdx, c);
							slotE.rawHex = null;
							const paramVals0 = modSnap.lv.slice(0, modSnap.pcnt);
							const allCmds: string[][] = [['add-module', slot, location,
								String(modSnap.type), String(moduleId), String(modSnap.horiz), String(modSnap.vert),
								String(modSnap.colour), String(modSnap.modes.length), ...modSnap.modes.map(String),
								String(modSnap.pcnt), ...paramVals0.map(String), modSnap.uname ?? '']];
							if (slotE.variations) {
								for (let v = 1; v < slotE.variations.length; v++) {
									for (let p = 0; p < modSnap.pcnt; p++) {
										const val = modSnap.lv[v * modSnap.pcnt + p];
										if (val !== undefined && val !== paramVals0[p])
											allCmds.push(['set-param', slot, location, String(moduleId), String(p), String(val), String(v)]);
									}
								}
							}
							for (const c of cableSnap) {
								allCmds.push(['add-cable', slot, location, String(c.colour),
									String(c.smod), c.dir === 0 ? '0' : '1', String(c.scon),
									String(c.dmod), '0', String(c.dcon)]);
							}
							if (allCmds.length > 0) await window.cli.runBatch(allCmds);
						},
						redo: async () => {
							await this.deleteModule(moduleId, area);
						},
					});
				}
			}

			mutDeleteModule(patch, areaIdx, moduleId);
			removeModuleFromVariations(slotEntry.variations, moduleId, areaIdx === 0 ? 'fx' : 'voice');
			slotEntry.rawHex = null;

			await window.cli.run(['del-module', slot, location, String(moduleId)]);

			return { name: slotEntry.name, rawHex: '', patch };
		},

		async moveModuleNoReload(moduleId: number, col: number, row: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			mutMoveModule(patch, areaIdx, moduleId, col, row);
			this.slots[slot].rawHex = null;

			await window.cli.run(['move-module', slot, location, String(moduleId), String(col), String(row)]);
		},

		async moveModule(moduleId: number, col: number, row: number, area: 'voice' | 'fx'): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const ctx = this._getActivePatch();
			if (!ctx) return null;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			mutMoveModule(patch, areaIdx, moduleId, col, row);
			this.slots[slot].rawHex = null;

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

			const { areaIdx, location } = areaConfig(area);
			mutAddModule(patch, areaIdx, mod);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const entry = this.slots[slot];
			if (entry.variations) {
				for (const vState of entry.variations) vState[areaKey][moduleId] = [...paramVals];
			}
			entry.rawHex = null;

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

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const modSnap = { ...mod, lv: [...mod.lv], modes: [...mod.modes] };
				hist.record(slot, {
					undo: async () => {
						await this.deleteModule(moduleId, area);
					},
					redo: async () => {
						await this.addModuleWithData(modSnap, moduleId, col, row, area);
					},
				});
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async addModuleWithData(
			src: ModuleInstance,
			newId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
		): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';

			const mod: ModuleInstance = { ...src, index: newId, horiz: col, vert: row, lv: [...src.lv], modes: [...src.modes] };
			mutAddModule(patch, areaIdx, mod);

			const paramVals0 = src.lv.slice(0, src.pcnt);
			const entry = this.slots[slot];
			if (entry.variations) {
				for (let v = 0; v < entry.variations.length; v++) {
					const start = v * src.pcnt;
					entry.variations[v][areaKey][newId] = src.lv.slice(start, start + src.pcnt);
				}
			}
			entry.rawHex = null;

			try {
				await window.cli.run([
					'add-module', slot, location,
					String(src.type), String(newId), String(col), String(row),
					String(src.colour),
					String(src.modes.length), ...src.modes.map(String),
					String(src.pcnt), ...paramVals0.map(String),
					src.uname ?? '',
				]);
			} catch (err) {
				console.warn('add-module CLI failed:', err);
			}

			if (src.pcnt > 0 && entry.variations) {
				const varCmds: string[][] = [];
				for (let v = 1; v < entry.variations.length; v++) {
					for (let p = 0; p < src.pcnt; p++) {
						const val = src.lv[v * src.pcnt + p];
						if (val !== undefined && val !== paramVals0[p]) {
							varCmds.push(['set-param', slot, location, String(newId), String(p), String(val), String(v)]);
						}
					}
				}
				if (varCmds.length > 0) {
					try {
						await window.cli.runBatch(varCmds);
					} catch (err) {
						console.warn('set-param batch CLI failed:', err);
					}
				}
			}

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const modSnap = { ...mod, lv: [...mod.lv], modes: [...mod.modes] };
				hist.record(slot, {
					undo: async () => {
						await this.deleteModule(newId, area);
					},
					redo: async () => {
						await this.addModuleWithData(modSnap, newId, col, row, area);
					},
				});
			}
		},

		async paste(
			entries: { src: ModuleInstance; newId: number; col: number; row: number }[],
			cables: { newSmod: number; newDmod: number; colour: number; scon: number; dcon: number; dir: number }[],
			area: 'voice' | 'fx',
		): Promise<void> {
			if (entries.length === 0) return;
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const hist = useHistoryStore();
			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			try {
				const { getModule } = await import('../renderer/nmg2mods');
				const currentModules = patch.areas[areaIdx].modules;
				const newIdSet = new Set(entries.map((e) => e.newId));

				const occupantsByCol = new Map<number, { row: number; height: number }[]>();
				for (const e of entries) {
					const height = getModule(e.src.type)?.height ?? 2;
					if (!occupantsByCol.has(e.col)) occupantsByCol.set(e.col, []);
					occupantsByCol.get(e.col)!.push({ row: e.row, height });
				}

				const pushDowns: { index: number; col: number; newRow: number }[] = [];
				for (const [col, occupants] of occupantsByCol) {
					const stationary = currentModules
						.filter((m) => m.horiz === col && !newIdSet.has(m.index))
						.map((m) => ({ index: m.index, vert: m.vert, height: getModule(m.type)?.height ?? 2 }));
					for (const d of resolveColumnCollisions(stationary, occupants)) {
						pushDowns.push({ index: d.index, col, newRow: d.newRow });
					}
				}

				// Capture original positions of pushed modules for undo
				const movedBack = pushDowns.map((d) => {
					const orig = currentModules.find((m) => m.index === d.index);
					return { index: d.index, col: d.col, fromRow: orig?.vert ?? d.newRow, toRow: d.newRow };
				});

				if (pushDowns.length > 0) {
					for (const p of pushDowns) mutMoveModule(patch, areaIdx, p.index, p.col, p.newRow);
					this.slots[slot].rawHex = null;
					try {
						await window.cli.runBatch(pushDowns.map((p) => ['move-module', slot, location, String(p.index), String(p.col), String(p.newRow)]));
					} catch (err) {
						console.warn('move-module batch CLI failed:', err);
					}
				}

				const slotEntry = this.slots[slot];
				const areaKey = areaIdx === 0 ? 'fx' : 'voice';
				const allCmds: string[][] = [];

				for (const { src, newId, col, row } of entries) {
					const mod: ModuleInstance = { ...src, index: newId, horiz: col, vert: row, lv: [...src.lv], modes: [...src.modes] };
					mutAddModule(patch, areaIdx, mod);
					if (slotEntry.variations) {
						for (let v = 0; v < slotEntry.variations.length; v++) {
							const start = v * src.pcnt;
							slotEntry.variations[v][areaKey][newId] = src.lv.slice(start, start + src.pcnt);
						}
					}
					const paramVals0 = src.lv.slice(0, src.pcnt);
					allCmds.push([
						'add-module', slot, location,
						String(src.type), String(newId), String(col), String(row),
						String(src.colour),
						String(src.modes.length), ...src.modes.map(String),
						String(src.pcnt), ...paramVals0.map(String),
						src.uname ?? '',
					]);
					if (src.pcnt > 0 && slotEntry.variations) {
						for (let v = 1; v < slotEntry.variations.length; v++) {
							for (let p = 0; p < src.pcnt; p++) {
								const val = src.lv[v * src.pcnt + p];
								if (val !== undefined && val !== paramVals0[p]) {
									allCmds.push(['set-param', slot, location, String(newId), String(p), String(val), String(v)]);
								}
							}
						}
					}
				}

				const addedCables = cables.map((c) => ({ smod: c.newSmod, scon: c.scon, dmod: c.newDmod, dcon: c.dcon, dir: c.dir, colour: c.colour }));
				for (const { newSmod, newDmod, colour, scon, dcon, dir } of cables) {
					mutAddCable(patch, areaIdx, { colour, smod: newSmod, scon, dir, dmod: newDmod, dcon });
					const fromConType = dir === 1 ? 1 : 0;
					allCmds.push(['add-cable', slot, location, String(colour),
						String(newSmod), String(fromConType), String(scon),
						String(newDmod), '0', String(dcon)]);
				}

				slotEntry.rawHex = null;
				try {
					for (let i = 0; i < allCmds.length; i += BATCH_CHUNK) {
						await window.cli.runBatch(allCmds.slice(i, i + BATCH_CHUNK));
					}
				} catch (err) {
					console.warn('paste batch CLI failed:', err);
				}

				if (shouldRecord) {
					const addedIds = entries.map((e) => e.newId);
					hist.record(slot, {
						undo: async () => {
							// Delete added cables first
							const delCableCmds = addedCables.map((c) => ['del-cable', slot, location, String(c.smod), c.dir === 0 ? '0' : '1', String(c.scon), String(c.dmod), '0', String(c.dcon)]);
							for (const c of addedCables) mutDeleteCable(patch, areaIdx, c);
							// Delete added modules
							const delModCmds = addedIds.map((id) => ['del-module', slot, location, String(id)]);
							for (const id of addedIds) {
								mutDeleteModule(patch, areaIdx, id);
								removeModuleFromVariations(this.slots[slot].variations, id, areaIdx === 0 ? 'fx' : 'voice');
							}
							// Restore pushed-down modules
							const moveCmds = movedBack.map((m) => ['move-module', slot, location, String(m.index), String(m.col), String(m.fromRow)]);
							for (const m of movedBack) mutMoveModule(patch, areaIdx, m.index, m.col, m.fromRow);
							this.slots[slot].rawHex = null;
							const allUndoCmds = [...delCableCmds, ...delModCmds, ...moveCmds];
							if (allUndoCmds.length > 0) {
								await window.cli.runBatch(allUndoCmds);
							}
						},
						redo: async () => {
							const currentCtx = this._getActivePatch();
							if (currentCtx) {
								const currentMods = currentCtx.patch.areas[areaIdx].modules;
								const currentIdSet = new Set(currentMods.map((m) => m.index));
								const reEntries = entries.filter((e) => !currentIdSet.has(e.newId));
								if (reEntries.length > 0) await this.paste(reEntries, cables, area);
							}
						},
					});
				}
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}
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

			const { areaIdx, location } = areaConfig(area);
			const hist = useHistoryStore();
			const shouldRecord = !hist.isLocked(slot);
			// Snapshot cable list before mutation to compute delta for undo
			const preCableList = shouldRecord ? (patch.areas[areaIdx].cableList ?? []).map((c) => ({ ...c })) : [];

			// Enforce output→input direction (source must be output, matching CLI swap logic)
			let smod = fromMod,
				scon = fromCon,
				stype = fromConType;
			let dmod = toMod,
				dcon = toCon,
				dtype = toConType;
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

			if (shouldRecord) {
				const postCableList = patch.areas[areaIdx].cableList ?? [];
				// Added cable = in post but not in pre
				const addedCable = postCableList.find((c) => !preCableList.some((b) => b.smod === c.smod && b.scon === c.scon && b.dmod === c.dmod && b.dcon === c.dcon)) ?? cable;
				// Recolored cables = in both pre and post but with different colour
				const recoloredOrig = preCableList.filter((b) => {
					const after = postCableList.find((a) => a.smod === b.smod && a.scon === b.scon && a.dmod === b.dmod && a.dcon === b.dcon);
					return after && after.colour !== b.colour;
				});
				hist.record(slot, {
					undo: async () => {
						// Delete the added cable
						mutDeleteCable(patch, areaIdx, addedCable);
						this.slots[slot].rawHex = null;
						await window.cli.run(['del-cable', slot, location, String(addedCable.smod),
							addedCable.dir === 0 ? '0' : '1', String(addedCable.scon),
							String(addedCable.dmod), '0', String(addedCable.dcon)]);
						// Restore recolored cables
						if (recoloredOrig.length > 0) {
							patch.areas[areaIdx].cableList = (patch.areas[areaIdx].cableList ?? []).map((c) => {
								const orig = recoloredOrig.find((b) => b.smod === c.smod && b.scon === c.scon && b.dmod === c.dmod && b.dcon === c.dcon);
								return orig ? { ...c, colour: orig.colour } : c;
							});
							this.slots[slot].rawHex = null;
							const restoreCmds: string[][] = [];
							for (const b of recoloredOrig) {
								restoreCmds.push(['del-cable', slot, location, String(b.smod), b.dir === 0 ? '0' : '1', String(b.scon), String(b.dmod), '0', String(b.dcon)]);
								restoreCmds.push(['add-cable', slot, location, String(b.colour), String(b.smod), b.dir === 0 ? '0' : '1', String(b.scon), String(b.dmod), '0', String(b.dcon)]);
							}
							await window.cli.runBatch(restoreCmds);
						}
					},
					redo: async () => {
						await this.addCable(fromMod, fromConType, fromCon, toMod, toConType, toCon, area, color);
					},
				});
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async setParam(moduleId: number, paramIdx: number, value: number, variation: number, area: 'voice' | 'fx', immediate = false): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const areaKey = areaIdx === 0 ? 'fx' : 'voice';
			const slotEntry = this.slots[slot];

			// Capture prev value before mutation
			const prevValue = slotEntry.variations?.[variation]?.[areaKey]?.[moduleId]?.[paramIdx] ?? value;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `param:${area}:${moduleId}:${paramIdx}:${variation}`;
				const box = { initial: prevValue, latest: value };
				hist.record(slot, {
					undo: async () => { await this.setParam(moduleId, paramIdx, box.initial as number, variation, area); },
					redo: async () => { await this.setParam(moduleId, paramIdx, box.latest as number, variation, area); },
				}, cKey, box);
			}

			if (slotEntry.variations?.[variation]?.[areaKey]?.[moduleId]) {
				slotEntry.variations[variation][areaKey][moduleId][paramIdx] = value;
			}
			slotEntry.rawHex = null;

			const cmd = ['set-param', slot, location, String(moduleId), String(paramIdx), String(value), String(variation)];
			if (immediate) {
				window.cli.run(cmd).catch((err: unknown) => console.error('setParam failed:', err));
			} else {
				scheduleSend(`${slot}:${location}:${moduleId}:${paramIdx}:${variation}`, cmd);
			}
		},

		async setMode(moduleId: number, modeIdx: number, value: number, variation: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;

			const { areaIdx, location } = areaConfig(area);
			const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleId);
			const prevValue = mod?.modes?.[modeIdx] ?? value;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `mode:${area}:${moduleId}:${modeIdx}`;
				const box = { initial: prevValue, latest: value };
				hist.record(slot, {
					undo: async () => { await this.setMode(moduleId, modeIdx, box.initial as number, variation, area); },
					redo: async () => { await this.setMode(moduleId, modeIdx, box.latest as number, variation, area); },
				}, cKey, box);
			}

			if (mod?.modes) mod.modes[modeIdx] = value;
			this.slots[slot].rawHex = null;

			await window.cli.run(['set-module-mode', slot, location, String(moduleId), String(modeIdx), String(value)]);
		},

		async loadSlot(slot: SlotLabel): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			this.slots[slot].loading = true;
			this.slots[slot].error = null;
			try {
				const output = await window.cli.run(['get-patch', slot]);
				return await this._applyPatchOutput(slot, output);
			} catch (e: any) {
				if (!this.slots[slot].patch) {
					this.slots[slot].error = e.message;
				} else {
					console.warn(`loadSlot(${slot}) reload failed, keeping existing data:`, e.message);
				}
				return null;
			} finally {
				this.slots[slot].loading = false;
			}
		},

		loadPatchFile(slot: SlotLabel, patch: Patch, name: string, rawHex?: string, filepath?: string): void {
			this.slots[slot].patch = patch;
			this.slots[slot].variations = extractVariations(patch);
			this.slots[slot].name = name;
			if (rawHex) {
				this.slots[slot].rawHex = rawHex;
				this.slots[slot].templateRawHex = rawHex;
			}
			if (filepath) this.slotFilePaths[slot] = filepath;
			useHistoryStore().clearHistory(slot);
		},

		loadPerformanceFile(patches: Patch[], slotNames: string[], name: string, rawHex: string, filepath?: string): void {
			const labels: SlotLabel[] = ['A', 'B', 'C', 'D'];
			const hist = useHistoryStore();
			for (let i = 0; i < 4; i++) {
				const slotName = slotNames[i] || name;
				this.slots[labels[i]].patch = patches[i];
				this.slots[labels[i]].variations = extractVariations(patches[i]);
				this.slots[labels[i]].name = slotName;
				// Per-slot rawHex is NOT set — prf2 serialization uses the full performance template
				this.slots[labels[i]].rawHex = null;
				this.slots[labels[i]].templateRawHex = null;
				this.slotFilePaths[labels[i]] = '';
				hist.clearHistory(labels[i]);
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
			const variationsArray = (['A', 'B', 'C', 'D'] as SlotLabel[]).map((s) => this.slots[s].variations ?? []);
			const newRawHex = serializePerformance(patches, this.performanceRawHex, variationsArray);
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
				entry.rawHex = serializePatch(entry.name, entry.patch, entry.templateRawHex, entry.variations ?? []);
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
			const { areaIdx, location } = areaConfig(area);

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

			// Capture original positions before mutation
			const pushedBack = pushDowns.map((d) => {
				const orig = currentModuleList.find((m: any) => m.index === d.index);
				return { index: d.index, col: d.col, fromRow: orig?.vert ?? d.newRow, toRow: d.newRow };
			});

			for (const p of pushDowns) mutMoveModule(patch, areaIdx, p.index, p.col, p.newRow);
			for (const t of targets) mutMoveModule(patch, areaIdx, t.index, t.toCol, t.toRow);
			this.slots[slot].rawHex = null;

			const cliCmds: string[][] = [
				...pushDowns.map((p) => ['move-module', slot, location, String(p.index), String(p.col), String(p.newRow)]),
				...targets.map((t) => ['move-module', slot, location, String(t.index), String(t.toCol), String(t.toRow)]),
			];
			if (cliCmds.length > 0) await window.cli.runBatch(cliCmds);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				hist.record(slot, {
					undo: async () => {
						const undoCmds: string[][] = [];
						for (const m of pushedBack) {
							mutMoveModule(patch, areaIdx, m.index, m.col, m.fromRow);
							undoCmds.push(['move-module', slot, location, String(m.index), String(m.col), String(m.fromRow)]);
						}
						for (const t of targets) {
							mutMoveModule(patch, areaIdx, t.index, t.fromCol, t.fromRow);
							undoCmds.push(['move-module', slot, location, String(t.index), String(t.fromCol), String(t.fromRow)]);
						}
						this.slots[slot].rawHex = null;
						if (undoCmds.length > 0) await window.cli.runBatch(undoCmds);
					},
					redo: async () => {
						const currentCtx = this._getActivePatch();
						if (currentCtx) {
							const currentMods = currentCtx.patch.areas[areaIdx].modules;
							await this.moveModulesWithCollision(indices, dCol, dRow, area, currentMods);
						}
					},
				});
			}

			return { name: this.slots[slot].name, rawHex: '', patch };
		},

		async dropModuleWithCollision(
			typeId: number,
			col: number,
			row: number,
			area: 'voice' | 'fx',
			currentModuleList: any[],
		): Promise<{ name: string; rawHex: string; patch: Patch } | null> {
			const hist = useHistoryStore();
			const slot = useUiStore().slotInFocus;
			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			try {
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
				const pushDowns = this._resolveColumnCollisions(colMods, [{ row, height }]);
				const movedBack = pushDowns.map((d) => {
					const orig = colMods.find((m) => m.index === d.index);
					return { index: d.index, col, fromRow: orig?.vert ?? d.newRow, toRow: d.newRow };
				});

				for (const d of pushDowns) await this.moveModuleNoReload(d.index, col, d.newRow, area);
				const result = await this.addModule(typeId, moduleId, col, row, area);

				if (shouldRecord) {
					const { areaIdx } = areaConfig(area);
					const ctx = this._getActivePatch();
					const addedMod = ctx ? findModuleByIndex(ctx.patch.areas[areaIdx].modules, moduleId) : null;
					const modSnap = addedMod ? { ...addedMod, lv: [...addedMod.lv], modes: [...addedMod.modes] } : null;

					hist.record(slot, {
						undo: async () => {
							await this.deleteModule(moduleId, area);
							for (const m of movedBack) await this.moveModuleNoReload(m.index, m.col, m.fromRow, area);
						},
						redo: async () => {
							for (const m of movedBack) await this.moveModuleNoReload(m.index, m.col, m.toRow, area);
							if (modSnap) await this.addModuleWithData(modSnap, moduleId, col, row, area);
							else await this.addModule(typeId, moduleId, col, row, area);
						},
					});
				}

				return result;
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}
		},

		async setModuleColors(moduleIds: number[], color: number, area: 'voice' | 'fx'): Promise<void> {
			if (moduleIds.length === 0) return;
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const prevColors = moduleIds.map((id) => {
					const mod = findModuleByIndex(patch.areas[areaIdx].modules, id);
					return { id, prevColor: mod?.colour ?? color };
				});
				hist.record(slot, {
					undo: async () => {
						for (const { id, prevColor } of prevColors) {
							await this.setModuleColors([id], prevColor, area);
						}
					},
					redo: async () => {
						await this.setModuleColors(moduleIds, color, area);
					},
				});
			}

			for (const id of moduleIds) mutSetModuleColor(patch, areaIdx, id, color);
			this.slots[slot].rawHex = null;
			await window.cli.runBatch(moduleIds.map((id) => ['set-module-color', slot, location, String(id), String(color)]));
		},

		async setModuleLabel(moduleId: number, label: string, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx].modules, moduleId);
				const prevLabel = mod?.uname ?? '';
				hist.record(slot, {
					undo: async () => { await this.setModuleLabel(moduleId, prevLabel, area); },
					redo: async () => { await this.setModuleLabel(moduleId, label, area); },
				});
			}

			mutSetModuleLabel(patch, areaIdx, moduleId, label);
			this.slots[slot].rawHex = null;
			await window.cli.run(['set-module-name', slot, location, String(moduleId), label]);
		},

		async setPatchName(name: string): Promise<void> {
			name = name.trim();
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot } = ctx;
			this.slots[slot].name = name;
			if (useDeviceStore().status === DeviceStatus.Connected) {
				await window.cli.run(['set-patch-name', slot, name]);
			}
		},

		async setPatchDescription(): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx || !ctx.patch.description) return;
			const { slot, patch } = ctx;
			const description = patch.description!;
			const templateHex = this.slots[slot].templateRawHex;
			if (!templateHex || useDeviceStore().status !== DeviceStatus.Connected) return;
			const { buildPatchDescriptionBytes } = await import('../parser/nmg2PatchSerializer');
			const bytes = buildPatchDescriptionBytes(templateHex, description);
			if (!bytes) return;
			const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
			await window.cli.run(['set-patch-description', slot, hex]);
		},

		setMorphParam(variation: number, morphIdx: number, field: 'dial' | 'mode', value: number): void {
			const slot = useUiStore().slotInFocus;
			const entry = this.slots[slot];
			if (!entry?.variations?.[variation]) return;

			const patch = entry.variations[variation].patch;
			const prevValue = field === 'dial' ? patch.morphDials[morphIdx] : patch.morphModes[morphIdx];

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `morph:${variation}:${morphIdx}:${field}`;
				const box = { initial: prevValue, latest: value };
				hist.record(slot, {
					undo: () => { this.setMorphParam(variation, morphIdx, field, box.initial as number); return Promise.resolve(); },
					redo: () => { this.setMorphParam(variation, morphIdx, field, box.latest as number); return Promise.resolve(); },
				}, cKey, box);
			}

			if (field === 'dial') patch.morphDials[morphIdx] = value;
			else patch.morphModes[morphIdx] = value;
			entry.rawHex = null;
			const param = field === 'dial' ? morphIdx : 8 + morphIdx;
			const delay = field === 'dial' ? 16 : 0;
			scheduleSend(`${slot}:patch:1:${param}:${variation}`,
				['set-param', slot, 'patch', '1', String(param), String(value), String(variation)], delay);
		},

		async setPatchParam(variation: number, key: string, value: number): Promise<void> {
			const slot = useUiStore().slotInFocus;
			const entry = this.slots[slot];

			const prevValue = (entry?.variations?.[variation]?.patch as unknown as Record<string, number>)?.[key] ?? value;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const cKey = `patchparam:${variation}:${key}`;
				const box = { initial: prevValue, latest: value };
				hist.record(slot, {
					undo: async () => { await this.setPatchParam(variation, key, box.initial as number); },
					redo: async () => { await this.setPatchParam(variation, key, box.latest as number); },
				}, cKey, box);
			}

			if (entry?.variations?.[variation]) {
				(entry.variations[variation].patch as unknown as Record<string, number>)[key] = value;
				entry.rawHex = null;
			}
			const paramIdx = PATCH_PARAM_KEYS.indexOf(key as keyof PatchParamVariation);
			if (paramIdx < 0) return;
			// Convert global index to section + local index (inverse of SECTION_OFFSETS in useSlotEvents.ts)
			const SECTION_STARTS = [
				{ section: 2, start: 0 },
				{ section: 3, start: 2 },
				{ section: 4, start: 4 },
				{ section: 5, start: 6 },
				{ section: 6, start: 9 },
				{ section: 7, start: 13 },
				{ section: 8, start: 15 },
			];
			let section = 2, local = paramIdx;
			for (let i = 0; i < SECTION_STARTS.length - 1; i++) {
				if (paramIdx >= SECTION_STARTS[i].start && paramIdx < SECTION_STARTS[i + 1].start) {
					section = SECTION_STARTS[i].section;
					local = paramIdx - SECTION_STARTS[i].start;
					break;
				}
			}
			scheduleSend(`${slot}:patch:${section}:${local}:${variation}`,
				['set-param', slot, 'patch', String(section), String(local), String(value), String(variation)]);
		},

		async setParamLabel(moduleIndex: number, paramIndex: number, label: string, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleIndex);
				const existingLabel = (mod?.paramLabels as any[])?.find((pl: any) => pl.paramIndex === paramIndex);
				const prevLabel = existingLabel?.labels?.[0] ?? '';
				hist.record(slot, {
					undo: async () => { await this.setParamLabel(moduleIndex, paramIndex, prevLabel, area); },
					redo: async () => { await this.setParamLabel(moduleIndex, paramIndex, label, area); },
				});
			}

			const mod = findModuleByIndex(patch.areas[areaIdx]?.modules ?? [], moduleIndex);
			if (!mod) return;
			if (!mod.paramLabels) mod.paramLabels = [];
			let entry = (mod.paramLabels as any[]).find((pl: any) => pl.paramIndex === paramIndex);
			if (!entry) {
				entry = { paramIndex, isString: false, paramLen: 7, labels: [label] };
				(mod.paramLabels as any[]).push(entry);
			} else {
				entry.labels[0] = label;
			}
			this.slots[slot].rawHex = null;
			await window.cli.run(['set-param-label', slot, location, String(moduleIndex), String(paramIndex), '0', label]);
		},

		async setCableColor(moduleIndex: number, connectorIndex: number, type: 'input' | 'output', color: number, area: 'voice' | 'fx'): Promise<void> {
			const ctx = this._getActivePatch();
			if (!ctx) return;
			const { slot, patch } = ctx;
			const { areaIdx, location } = areaConfig(area);
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => matchesCableJack(c, moduleIndex, connectorIndex, type));
			if (matching.length === 0) return;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const prevColorMap = matching.map((c) => ({ ...c }));
				hist.record(slot, {
					undo: async () => {
						patch.areas[areaIdx].cableList = (patch.areas[areaIdx].cableList ?? []).map((c) => {
							const orig = prevColorMap.find((b) => b.smod === c.smod && b.scon === c.scon && b.dmod === c.dmod && b.dcon === c.dcon);
							return orig ? { ...c, colour: orig.colour } : c;
						});
						this.slots[slot].rawHex = null;
						await window.cli.runBatch(prevColorMap.map((b) => ['set-cable-color', slot, location, String(b.colour),
							String(b.smod), (b.dir ?? 1) === 0 ? '0' : '1', String(b.scon),
							String(b.dmod), '0', String(b.dcon)]));
					},
					redo: async () => { await this.setCableColor(moduleIndex, connectorIndex, type, color, area); },
				});
			}

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
			const { areaIdx, location } = areaConfig(area);
			const cableList = patch.areas[areaIdx].cableList ?? [];
			const matching = cableList.filter((c) => matchesCableJack(c, moduleIndex, connectorIndex, type));
			if (matching.length === 0) return;

			const hist = useHistoryStore();
			if (!hist.isLocked(slot)) {
				const deletedCables = matching.map((c) => ({ ...c }));
				hist.record(slot, {
					undo: async () => {
						for (const c of deletedCables) mutAddCable(patch, areaIdx, c);
						this.slots[slot].rawHex = null;
						await window.cli.runBatch(deletedCables.map((c) => ['add-cable', slot, location, String(c.colour),
							String(c.smod), c.dir === 0 ? '0' : '1', String(c.scon),
							String(c.dmod), '0', String(c.dcon)]));
					},
					redo: async () => { await this.deleteConnectedCables(moduleIndex, connectorIndex, type, area); },
				});
			}

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

		updateResources(slot: SlotLabel, data: number[]): void {
			const applyBlock = (o: number) => {
				if (data.length < o + 28) return;
				const loc = data[o];
				const metrics = { cycles: parseResourceCycles(data, o), memory: parseResourceMemory(data, o) };
				if (loc === 1) this.slots[slot].resources.va = metrics;
				else if (loc === 0) this.slots[slot].resources.fx = metrics;
			};
			applyBlock(0);
			// Compound packet: 0x72 sub-command marker at offset 28 → second block at offset 29
			if (data.length >= 57 && data[28] === 0x72) applyBlock(29);
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

			const { areaIdx, location } = areaConfig(area);
			const hist = useHistoryStore();
			const shouldRecord = !hist.isLocked(slot);
			if (shouldRecord) hist.lock(slot);

			try {
				// Capture pre-state for history
				let modSnaps: ModuleInstance[] = [];
				let cableSnaps: Cable[] = [];

				if (shouldRecord) {
					const areaKey = areaIdx === 0 ? 'fx' : 'voice';
					if (selectedModules.length > 0) {
						for (const id of selectedModules) {
							const mod = findModuleByIndex(patch.areas[areaIdx].modules, id);
							if (!mod) continue;
							const pcnt = mod.pcnt;
							const numVar = this.slots[slot].variations?.length ?? 1;
							const lvSnap = Array(pcnt * numVar).fill(0);
							for (let v = 0; v < numVar; v++) {
								const varParams = this.slots[slot].variations?.[v]?.[areaKey]?.[id] ?? [];
								for (let p = 0; p < pcnt; p++) lvSnap[v * pcnt + p] = varParams[p] ?? 0;
							}
							modSnaps.push({ ...mod, lv: lvSnap, modes: [...mod.modes] } as ModuleInstance);
						}
						cableSnaps = (patch.areas[areaIdx].cableList ?? [])
							.filter((c) => selectedModules.includes(c.smod) || selectedModules.includes(c.dmod))
							.map((c) => ({ ...c } as Cable));
					} else if (selectedCables.length > 0) {
						cableSnaps = selectedCables.map((c) => ({ ...c } as Cable));
					}
				}

				if (selectedModules.length > 0 && selectedCables.length === 0) {
					const cliCmds: string[][] = [];
					const deletedCableKeys = new Set<string>();
					for (const id of selectedModules) {
						for (const c of currentCableList.filter((c: any) => c.smod === id || c.dmod === id)) {
							const key = `${c.smod}-${c.scon}-${c.dmod}-${c.dcon}`;
							if (!deletedCableKeys.has(key)) {
								deletedCableKeys.add(key);
								mutDeleteCable(patch, areaIdx, c);
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
						mutDeleteModule(patch, areaIdx, id);
						removeModuleFromVariations(this.slots[slot].variations, id, areaIdx === 0 ? 'fx' : 'voice');
						cliCmds.push(['del-module', slot, location, String(id)]);
					}
					this.slots[slot].rawHex = null;
					if (slot && cliCmds.length > 0) await window.cli.runBatch(cliCmds);
				} else if (selectedCables.length > 0) {
					const cliCmds: string[][] = [];
					for (const cable of selectedCables) {
						const smod = cable.smod!;
						const scon = cable.scon!;
						const dmod = cable.dmod!;
						const dcon = cable.dcon!;
						mutDeleteCable(patch, areaIdx, { smod, scon, dmod, dcon });
						cliCmds.push(['del-cable', slot, location, String(smod), cable.dir === 0 ? '0' : '1', String(scon), String(dmod), '0', String(dcon)]);
					}
					this.slots[slot].rawHex = null;
					if (slot && cliCmds.length > 0) await window.cli.runBatch(cliCmds);
				}

				if (shouldRecord) {
					const areaKey = areaIdx === 0 ? 'fx' : 'voice';
					hist.record(slot, {
						undo: async () => {
							for (const mod of modSnaps) {
								mutAddModule(patch, areaIdx, { ...mod, lv: [...mod.lv], modes: [...mod.modes] });
								const slotE = this.slots[slot];
								if (slotE.variations) {
									for (let v = 0; v < slotE.variations.length; v++) {
										const start = v * mod.pcnt;
										slotE.variations[v][areaKey][mod.index] = mod.lv.slice(start, start + mod.pcnt);
									}
								}
							}
							for (const c of cableSnaps) mutAddCable(patch, areaIdx, { ...c, dir: c.dir ?? 1 });
							this.slots[slot].rawHex = null;
							const allCmds: string[][] = [];
							for (const mod of modSnaps) {
								const paramVals0 = mod.lv.slice(0, mod.pcnt);
								allCmds.push(['add-module', slot, location,
									String(mod.type), String(mod.index), String(mod.horiz), String(mod.vert),
									String(mod.colour), String(mod.modes.length), ...mod.modes.map(String),
									String(mod.pcnt), ...paramVals0.map(String), mod.uname ?? '']);
								const slotE = this.slots[slot];
								if (slotE.variations) {
									for (let v = 1; v < slotE.variations.length; v++) {
										for (let p = 0; p < mod.pcnt; p++) {
											const val = mod.lv[v * mod.pcnt + p];
											if (val !== undefined && val !== paramVals0[p])
												allCmds.push(['set-param', slot, location, String(mod.index), String(p), String(val), String(v)]);
										}
									}
								}
							}
							for (const c of cableSnaps) {
								const cn = { ...c, dir: c.dir ?? 1 };
								allCmds.push(['add-cable', slot, location, String(cn.colour),
									String(cn.smod), cn.dir === 0 ? '0' : '1', String(cn.scon),
									String(cn.dmod), '0', String(cn.dcon)]);
							}
							for (let i = 0; i < allCmds.length; i += BATCH_CHUNK) {
								await window.cli.runBatch(allCmds.slice(i, i + BATCH_CHUNK));
							}
						},
						redo: async () => {
							const currentCtx = this._getActivePatch();
							if (currentCtx) {
								const currentMods = currentCtx.patch.areas[areaIdx].modules;
								const currentCables = currentCtx.patch.areas[areaIdx].cableList ?? [];
								await this.deleteSelection(selectedModules, selectedCables, area, currentMods, currentCables);
							}
						},
					});
				}
			} finally {
				if (shouldRecord) hist.unlock(slot);
			}
		},

		async undo(): Promise<void> {
			const slot = useUiStore().slotInFocus;
			const hist = useHistoryStore();
			const entry = hist.popUndo(slot);
			if (!entry) return;
			hist.lock(slot);
			try {
				await entry.undo();
			} catch (err) {
				console.warn('[undo] CLI failed (offline?):', err);
			} finally {
				hist.unlock(slot);
			}
		},

		async redo(): Promise<void> {
			const slot = useUiStore().slotInFocus;
			const hist = useHistoryStore();
			const entry = hist.popRedo(slot);
			if (!entry) return;
			hist.lock(slot);
			try {
				await entry.redo();
			} catch (err) {
				console.warn('[redo] CLI failed (offline?):', err);
			} finally {
				hist.unlock(slot);
			}
		},
	},
});
