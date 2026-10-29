import type { Cable } from '@/renderer/cableRenderer';
import type {
	GlobalParamPageAssignment,
	MidiCCAssignment,
	ModuleInstance,
	MorphAssignment,
	ParamPageAssignment,
	Patch,
	PatchParamVariation,
	SlotLabel,
	VariationState,
} from '@/types';
import { NUM_VARIATIONS } from '@/types';
import { MORPH_NAMES } from '@/types/patch';
import { getDefaultParamValues, getModule } from '@/renderer/nmg2mods';
import { defaultMutaLock } from '@/renderer/mutator';

// Morph Group i's display name: its custom label (PATCH_MORPH param 8+i), else the default name.
export function morphGroupName(patch: Patch | null | undefined, i: number): string {
	return patch?.morphParamLabels?.find((pl) => pl.paramIndex === 8 + i)?.labels?.[0] || MORPH_NAMES[i];
}

export function areaConfig(area: 'voice' | 'fx'): { areaIdx: 0 | 1; location: 'va' | 'fx' } {
	return area === 'voice' ? { areaIdx: 1, location: 'va' } : { areaIdx: 0, location: 'fx' };
}

// Resolves the working area from the current UI state: an explicit selection area wins,
// otherwise fall back to the active area.
export function resolveSelectionArea(ui: { selectedModulesArea: 'va' | 'fx' | null; activeArea: number }): 'voice' | 'fx' {
	if (ui.selectedModulesArea === 'va') return 'voice';
	if (ui.selectedModulesArea === 'fx') return 'fx';
	return ui.activeArea === 1 ? 'voice' : 'fx';
}

// Target of a module context-menu action: the selection when the module is part of it (same area — module
// indices repeat between VA and FX), else just this module.
export function moduleActionTargets(
	ui: { selectedModules: number[]; selectedModulesArea: 'va' | 'fx' | null },
	moduleIndex: number,
	area: 'va' | 'fx',
): number[] {
	return ui.selectedModulesArea === area && ui.selectedModules.includes(moduleIndex) ? ui.selectedModules : [moduleIndex];
}

// Identity of a morph assignment (its range aside).
export function morphKey(a: MorphAssignment): string {
	return `${a.groupIndex}:${a.location}:${a.moduleIndex}:${a.paramIndex}`;
}

export function findModuleByIndex(modules: ModuleInstance[], id: number): ModuleInstance | undefined {
	return modules.find((m) => m.index === id);
}

export interface PasteParamsPair {
	targetId: number;
	paramValues: number[];
	modeValues: number[];
	morphs?: MorphAssignment[]; // the target's morph assignments after the paste; undefined = leave them (clipboard from an older build)
}

export interface ParamChange {
	area: 'voice' | 'fx';
	moduleId: number;
	paramIdx: number;
	value: number;
}

// The official editor's alert text when the selection doesn't fit the copied modules.
export const PASTE_PARAMS_MISMATCH = 'Selection does not match the original data.';

// Official CClipboard::ValidatePasteParams: as many target modules as copied ones, with the same types.
export function canPasteParams(clipboardTypes: number[], targetIds: number[], currentModules: ModuleInstance[]): boolean {
	if (clipboardTypes.length === 0 || clipboardTypes.length !== targetIds.length) return false;
	const a = [...clipboardTypes].sort((x, y) => x - y);
	const b = targetIds.map((id) => findModuleByIndex(currentModules, id)?.type ?? -1).sort((x, y) => x - y);
	return a.every((t, i) => t === b[i]);
}

// Official CPatchData::GetCopyParamsMolecules: each copied module goes to the first not-yet-used target
// of its type. Slices the source `lv` at `copiedVariation` (lv is flat: NUM_VARIATIONS * pcnt) and
// moves its morph assignments of that variation onto the target. null when the selection doesn't match.
export function buildPasteParamsPairs(
	sourceModules: ModuleInstance[],
	copiedVariation: number,
	targetIds: number[],
	currentModules: ModuleInstance[],
	sourceMorphs: MorphAssignment[][] | undefined,
	location: 0 | 1,
): PasteParamsPair[] | null {
	if (
		!canPasteParams(
			sourceModules.map((m) => m.type),
			targetIds,
			currentModules,
		)
	)
		return null;
	const free = targetIds.map((id) => findModuleByIndex(currentModules, id)!);
	return sourceModules.map((src) => {
		const target = free.splice(
			free.findIndex((t) => t.type === src.type),
			1,
		)[0];
		const offset = copiedVariation * src.pcnt;
		const morphs = sourceMorphs?.[copiedVariation]?.filter((a) => a.moduleIndex === src.index).map((a) => ({ ...a, location, moduleIndex: target.index }));
		return { targetId: target.index, paramValues: src.lv.slice(offset, offset + src.pcnt), modeValues: [...src.modes], morphs };
	});
}

export type JackEnd = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' };

export function sameJack(a: JackEnd, b: JackEnd): boolean {
	return a.moduleIndex === b.moduleIndex && a.connectorIndex === b.connectorIndex && a.type === b.type;
}

export function matchesCableJack(c: Cable, moduleIndex: number, connectorIndex: number, type: 'input' | 'output'): boolean {
	if (type === 'output') return (c.dir ?? 1) === 1 && c.smod === moduleIndex && c.scon === connectorIndex;
	return (
		((c.dir ?? 1) === 1 && c.dmod === moduleIndex && c.dcon === connectorIndex) ||
		((c.dir ?? 1) === 0 && ((c.smod === moduleIndex && c.scon === connectorIndex) || (c.dmod === moduleIndex && c.dcon === connectorIndex)))
	);
}

// Does `jack` correspond to this cable's smod/scon end (true) or its dmod/dcon end (false)?
// An input is the smod end only of an input→input cable (dir 0): with dir 1 smod/scon is an output,
// which on a self-loop shares module+connector with the input end (duration test 2026-10-08).
export function isCableSourceEnd(c: Cable, jack: JackEnd): boolean {
	if (jack.type === 'output') return true;
	return (c.dir ?? 1) === 0 && c.smod === jack.moduleIndex && c.scon === jack.connectorIndex;
}

export function defaultPatchParams(): PatchParamVariation {
	return {
		patchVol: 100,
		activeMuted: 1,
		glide: 0,
		glideTime: 0,
		bend: 0,
		semi: 0,
		vibrato: 0,
		cents: 0,
		rate: 0,
		arpeggiator: 0,
		arpTime: 0,
		arpType: 0,
		octaveShift: 0,
		sustain: 0,
		octaves: 0,
		morphDials: [0, 0, 0, 0, 0, 0, 0, 0],
		morphModes: [0, 0, 0, 0, 0, 0, 0, 0],
		morphAssignments: [],
	};
}

export function extractVariations(patch: Patch): VariationState[] {
	return Array.from({ length: NUM_VARIATIONS + 1 }, (_, v) => ({
		fx: Object.fromEntries(
			(patch.areas[0]?.modules ?? [])
				.filter((m) => m.pcnt > 0)
				.map((m) => [m.index, Array.from({ length: m.pcnt }, (_, p) => m.lv[v * m.pcnt + p] ?? 0)]),
		),
		voice: Object.fromEntries(
			(patch.areas[1]?.modules ?? [])
				.filter((m) => m.pcnt > 0)
				.map((m) => [m.index, Array.from({ length: m.pcnt }, (_, p) => m.lv[v * m.pcnt + p] ?? 0)]),
		),
		patch: patch.patchParams?.[v] ? { ...patch.patchParams[v] } : defaultPatchParams(),
	}));
}

// A new module with the editor's add-module defaults: default params in every variation, all modes 0, and named
// "<short><n>" with n one above the highest such suffix among `others`.
export function newModuleInstance(typeId: number, index: number, col: number, row: number, colour: number, others: ModuleInstance[]): ModuleInstance {
	const modDef = getModule(typeId);
	const paramVals = getDefaultParamValues(typeId);
	let maxSuffix = 0;
	for (const m of others.filter((o) => o.type === typeId)) {
		const match = m.uname?.match(/(\d+)$/);
		if (match) maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10));
	}
	return {
		type: typeId,
		index,
		horiz: col,
		vert: row,
		colour,
		uprate: 0,
		mutaLock: defaultMutaLock(typeId),
		pcnt: paramVals.length,
		lv: Array.from({ length: NUM_VARIATIONS }, () => paramVals).flat(),
		modes: Array(modDef?.modes?.length ?? 0).fill(0),
		uname: (modDef?.short ?? 'Module') + (maxSuffix + 1),
	};
}

export function removeModuleFromVariations(variations: VariationState[] | null, moduleId: number, areaKey: 'fx' | 'voice'): void {
	if (!variations) return;
	for (const v of variations) delete v[areaKey][moduleId];
}

// A module's live per-variation param values: `mod.lv` is only filled at load/add, edits go to `variations`.
export function liveModuleLv(mod: ModuleInstance, variations: VariationState[] | null | undefined, areaKey: 'fx' | 'voice'): number[] {
	const pcnt = mod.pcnt;
	const numVar = variations?.length ?? 1;
	const lv = Array(pcnt * numVar).fill(0);
	for (let v = 0; v < numVar; v++) {
		const varParams = variations?.[v]?.[areaKey]?.[mod.index] ?? [];
		for (let p = 0; p < pcnt; p++) lv[v * pcnt + p] = varParams[p] ?? 0;
	}
	return lv;
}

// Shared by deleteModule/replaceModule: snapshots a module's MIDI-CC, Parameter Page, and Global
// Parameter Page assignments before they're removed, so undo can restore them.
export function snapshotModuleAssignments(
	controllers: MidiCCAssignment[],
	paramPages: ParamPageAssignment[],
	globalParamPages: GlobalParamPageAssignment[],
	slot: SlotLabel,
	ccLocation: number,
	moduleId: number,
): { removedCCSnap: MidiCCAssignment[]; removedPagesSnap: ParamPageAssignment[]; removedGlobalPagesSnap: GlobalParamPageAssignment[] } {
	return {
		removedCCSnap: controllers.filter((c) => c.location === ccLocation && c.moduleIndex === moduleId),
		removedPagesSnap: paramPages.filter((k) => k.location === ccLocation && k.moduleIndex === moduleId),
		removedGlobalPagesSnap: globalParamPages.filter((k) => k.slot === slot && k.location === ccLocation && k.moduleIndex === moduleId),
	};
}

// Two-way-uniqueness single-slot assign (assignParamToPage/assignParamToGlobalPage): evicts
// whatever currently occupies `slotIndex` and whatever `sameKey` currently occupies (its old slot),
// then inserts `entry`. Shared by both Patch and Global variants — GlobalParamPageAssignment is a
// structural superset of ParamPageAssignment (adds `slot`).
export function computeAssignOne<T extends ParamPageAssignment>(
	prev: T[],
	slotIndex: number,
	sameKey: (k: T) => boolean,
	entry: T,
): { next: T[]; oldAtSlot?: T; oldKeySlot?: T } {
	const oldAtSlot = prev.find((k) => k.slotIndex === slotIndex);
	const oldKeySlot = prev.find(sameKey);
	const next = prev.filter((k) => k.slotIndex !== slotIndex && !sameKey(k));
	next.push(entry);
	return { next, oldAtSlot, oldKeySlot };
}

// Bulk "assign whole module" (assignModuleToPage/assignModuleToGlobalPage). Evicts ALL of this
// module's existing assignments (`sameModule`), not just ones with paramIndex < n — fixes a
// stragglers bug where a prior larger assign left paramIndex >= n behind after a shrink.
export function computeAssignModule<T extends ParamPageAssignment>(
	prev: T[],
	targetSlots: number[],
	paramIndices: number[],
	sameModule: (k: T) => boolean,
	makeEntry: (paramIndex: number, slotIndex: number) => T,
): { next: T[]; touched: number[] } {
	const targetSet = new Set(targetSlots);
	const next = prev.filter((k) => !targetSet.has(k.slotIndex) && !sameModule(k));
	targetSlots.forEach((slotIndex, i) => next.push(makeEntry(paramIndices[i], slotIndex)));
	const evictedElsewhere = prev.filter((k) => sameModule(k) && !targetSet.has(k.slotIndex)).map((k) => k.slotIndex);
	return { next, touched: [...targetSlots, ...evictedElsewhere] };
}

// Swaps (or moves, if the target is empty) two knob slots' occupants — one computed list so the
// pair lands as a single undo entry (Patch variant) or a single CLI apply (both variants).
export function computeSwap<T extends ParamPageAssignment>(prev: T[], sourceSlotIndex: number, targetSlotIndex: number): T[] | null {
	const source = prev.find((k) => k.slotIndex === sourceSlotIndex);
	if (!source) return null;
	const occupant = prev.find((k) => k.slotIndex === targetSlotIndex);
	const next = prev.filter((k) => k.slotIndex !== sourceSlotIndex && k.slotIndex !== targetSlotIndex);
	next.push({ ...source, slotIndex: targetSlotIndex } as T);
	if (occupant) next.push({ ...occupant, slotIndex: sourceSlotIndex } as T);
	return next;
}

// Builds the CLI commands re-syncing the touched knob slots to the final list — shared by
// _applyParamPages/_applyGlobalParamPages. Same order as the official editor's
// CKnobMap::GetAssignKnobToTargetMolecules: every touched slot is deassigned BEFORE anything is
// assigned (so a swap never has the same target on two knobs mid-way), and the page of the last
// assigned knob is then focused (CMParameterPageFocus(knob >> 3)), which makes the front panel
// show the new assignment. focusPageId is null when nothing was assigned.
export function buildTouchedCmds<T extends ParamPageAssignment>(
	list: T[],
	touched: number[],
	assignCmd: (entry: T) => string[],
	deassignCmd: (slotIndex: number) => string[],
): { cmds: string[][]; focusPageId: number | null } {
	const entries = touched.map((slotIndex) => list.find((k) => k.slotIndex === slotIndex)).filter((e): e is T => !!e);
	const last = entries[entries.length - 1];
	return {
		cmds: [...touched.map(deassignCmd), ...entries.map(assignCmd)],
		focusPageId: last ? last.slotIndex >> 3 : null,
	};
}

export function resolveColumnCollisions(
	stationaryModules: { index: number; vert: number; height: number }[],
	occupantRects: { row: number; height: number }[],
): { index: number; newRow: number }[] {
	if (occupantRects.length === 0) return [];
	const occupants = [...occupantRects].sort((a, b) => a.row - b.row);
	const sorted = [...stationaryModules].sort((a, b) => a.vert - b.vert);
	const newRows = new Map(sorted.map((m) => [m.index, m.vert]));
	let floor = 0;
	for (const mod of sorted) {
		let candidate = Math.max(newRows.get(mod.index)!, floor);
		for (const o of occupants) {
			if (candidate < o.row + o.height && candidate + mod.height > o.row) {
				candidate = o.row + o.height;
			}
		}
		newRows.set(mod.index, candidate);
		floor = candidate + mod.height;
	}
	return sorted
		.filter((m) => newRows.get(m.index) !== m.vert)
		.map((m) => ({
			index: m.index,
			newRow: newRows.get(m.index)!,
		}));
}

/** Module indices are 1..127 per area. The official editor takes the lowest free one
 * (CPatchData::GetUniqueID); 128 is NACKed by the G2 and a follow-up add/cable wedges it. */
export const MAX_MODULE_INDEX = 127;
export const AREA_FULL_MESSAGE = `No room for more modules: an area holds at most ${MAX_MODULE_INDEX}.`;

/** The `count` lowest unused module indices, or null when the area has no room for them. */
export function freeModuleIds(existingIds: number[], count: number): number[] | null {
	const used = new Set(existingIds);
	const ids: number[] = [];
	for (let i = 1; i <= MAX_MODULE_INDEX && ids.length < count; i++) if (!used.has(i)) ids.push(i);
	return ids.length === count ? ids : null;
}

/** Returns null when the destination area has no room for the clones. */
export function buildCloneEntries(
	modules: ModuleInstance[],
	cables: Cable[],
	existingIds: number[],
	dCol: number,
	dRow: number,
): {
	entries: { src: ModuleInstance; newId: number; col: number; row: number }[];
	remappedCables: { newSmod: number; newDmod: number; colour: number; userColour?: number; scon: number; dcon: number; dir: number }[];
} | null {
	const newIds = freeModuleIds(existingIds, modules.length);
	if (!newIds) return null;

	const idMap = new Map<number, number>();
	modules.forEach((mod, i) => idMap.set(mod.index, newIds[i]));

	const entries = modules.map((mod) => ({
		src: mod,
		newId: idMap.get(mod.index)!,
		col: Math.max(0, mod.horiz + dCol),
		row: Math.max(0, mod.vert + dRow),
	}));

	const remappedCables = cables
		.filter((c) => idMap.has(c.smod) && idMap.has(c.dmod))
		.map((c) => ({
			newSmod: idMap.get(c.smod)!,
			newDmod: idMap.get(c.dmod)!,
			colour: c.colour,
			userColour: c.userColour,
			scon: c.scon,
			dcon: c.dcon,
			dir: c.dir ?? 1,
		}));

	return { entries, remappedCables };
}

export function resolvePasteRowOffset(modules: { vert: number; height: number }[], dCol: number, dRow: number): number {
	if (dCol !== 0) return dRow;
	if (!modules.some((m) => Math.abs(dRow) < m.height)) return dRow;
	const minRow = Math.min(...modules.map((m) => m.vert));
	const maxBottom = Math.max(...modules.map((m) => m.vert + m.height));
	return maxBottom - minRow;
}

// Told about every failed push (set by the slots store), which re-reads the slot when the G2 was
// reachable: the local edit is then ahead of the G2.
let cliFailureHandler: ((cmd: (string | number[])[], err: unknown) => void) | null = null;
export function setCliFailureHandler(fn: typeof cliFailureHandler): void {
	cliFailureHandler = fn;
}

// Pushing a mutation to hardware is always best-effort: the offline case (or a mid-command
// disconnect) must not surface as an error, since the local edit already succeeded.
export async function runCliSafe(cmd: (string | number[])[], label: string): Promise<void> {
	try {
		await window.cli.run(cmd);
	} catch (err) {
		console.warn(`${label}: CLI failed (offline?):`, err);
		cliFailureHandler?.(cmd, err);
	}
}

// The daemon's seq executes at most this many commands and silently drops the rest (SEQ_MAX_OPS, daemon.c).
export const BATCH_CHUNK = 128;

export async function runCliBatchSafe(cmds: string[][], label: string): Promise<void> {
	try {
		for (let i = 0; i < cmds.length; i += BATCH_CHUNK) await window.cli.runBatch(cmds.slice(i, i + BATCH_CHUNK));
	} catch (err) {
		console.warn(`${label}: CLI failed (offline?):`, err);
		if (cmds.length > 0) cliFailureHandler?.(cmds[0], err);
	}
}

const NAME_MODULE_TYPE = 126;

// A Name bar has no jacks (always "unused"); only count it as unused if the user never customized it.
// Default names are "<short><digits>" (see addModule); the digits are no longer the module's
// index, so match the shape rather than reconstructing the exact value.
function isUntouchedNameModule(m: ModuleInstance): boolean {
	if ((m.colour || 0) !== 0) return false;
	const base = (getModule(m.type)?.short ?? 'Module').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^${base}\\d+$`).test(m.uname ?? '');
}

/** Module indices in `location` (0=fx, 1=voice) with a Parameter Page or MIDI CC assignment. */
export function assignedModules(slot: { controllers: MidiCCAssignment[]; paramPages: ParamPageAssignment[] }, location: 0 | 1): Set<number> {
	return new Set([...slot.controllers, ...slot.paramPages].filter((a) => a.location === location).map((a) => a.moduleIndex));
}

/** True when no cable touches the module and it has no Parameter Page or MIDI CC assignment
 *  (`assigned`, see assignedModules) — what Patch → Delete Unused Modules removes. */
export function isUnusedModule(m: ModuleInstance, cables: Cable[], assigned: ReadonlySet<number>): boolean {
	if (assigned.has(m.index) || cables.some((c) => c.smod === m.index || c.dmod === m.index)) return false;
	return m.type !== NAME_MODULE_TYPE || isUntouchedNameModule(m);
}
