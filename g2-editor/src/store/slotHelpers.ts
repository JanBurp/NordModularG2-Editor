import type { Cable } from '@/renderer/cableRenderer';
import type {
	GlobalParamPageAssignment,
	MidiCCAssignment,
	ModuleInstance,
	ParamPageAssignment,
	Patch,
	PatchParamVariation,
	SlotLabel,
	VariationState,
} from '@/types';
import { NUM_VARIATIONS } from '@/types';
import { getModule } from '@/renderer/nmg2mods';

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

export function findModuleByIndex(modules: ModuleInstance[], id: number): ModuleInstance | undefined {
	return modules.find((m) => m.index === id);
}

export interface PasteParamsPair {
	targetId: number;
	paramValues: number[];
	modeValues: number[];
}

// Pairs copied modules with target ids by order, keeping only same-type pairs, and slices each
// source module's `lv` at `copiedVariation` (lv is flat: NUM_VARIATIONS * pcnt).
export function buildPasteParamsPairs(
	sourceModules: ModuleInstance[],
	copiedVariation: number,
	targetIds: number[],
	currentModules: ModuleInstance[],
): PasteParamsPair[] {
	const pairs: PasteParamsPair[] = [];
	const count = Math.min(sourceModules.length, targetIds.length);
	for (let i = 0; i < count; i++) {
		const src = sourceModules[i];
		const target = findModuleByIndex(currentModules, targetIds[i]);
		if (!target || target.type !== src.type) continue;
		const offset = copiedVariation * src.pcnt;
		pairs.push({ targetId: target.index, paramValues: src.lv.slice(offset, offset + src.pcnt), modeValues: [...src.modes] });
	}
	return pairs;
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
	return Array.from({ length: NUM_VARIATIONS }, (_, v) => ({
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

export function removeModuleFromVariations(variations: VariationState[] | null, moduleId: number, areaKey: 'fx' | 'voice'): void {
	if (!variations) return;
	for (const v of variations) delete v[areaKey][moduleId];
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

// Builds one assign/deassign CLI command per touched slot from the final list — shared by
// _applyParamPages/_applyGlobalParamPages, replacing their former sequential-await loops.
export function buildTouchedCmds<T extends ParamPageAssignment>(
	list: T[],
	touched: number[],
	assignCmd: (entry: T) => string[],
	deassignCmd: (slotIndex: number) => string[],
): string[][] {
	return touched.map((slotIndex) => {
		const entry = list.find((k) => k.slotIndex === slotIndex);
		return entry ? assignCmd(entry) : deassignCmd(slotIndex);
	});
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
let cliFailureHandler: ((cmd: string[], err: unknown) => void) | null = null;
export function setCliFailureHandler(fn: typeof cliFailureHandler): void {
	cliFailureHandler = fn;
}

// Pushing a mutation to hardware is always best-effort: the offline case (or a mid-command
// disconnect) must not surface as an error, since the local edit already succeeded.
export async function runCliSafe(cmd: string[], label: string): Promise<void> {
	try {
		await window.cli.run(cmd);
	} catch (err) {
		console.warn(`${label}: CLI failed (offline?):`, err);
		cliFailureHandler?.(cmd, err);
	}
}

export async function runCliBatchSafe(cmds: string[][], label: string): Promise<void> {
	try {
		await window.cli.runBatch(cmds);
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

/** True when no cable touches the module — what Patch → Delete Unused Modules removes. */
export function isUnusedModule(m: ModuleInstance, cables: Cable[]): boolean {
	if (cables.some((c) => c.smod === m.index || c.dmod === m.index)) return false;
	return m.type !== NAME_MODULE_TYPE || isUntouchedNameModule(m);
}
