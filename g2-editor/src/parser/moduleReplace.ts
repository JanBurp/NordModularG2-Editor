import type { Cable } from '@/types/patch';
import type { ModuleDefinition, ModuleParam, ModuleMode } from '@/types/module';
import { getDefaultParamValues, getParamDefault } from '@/renderer/nmg2mods';

// Matches each `newDef` param/mode to the first not-yet-consumed `oldDef` entry with the same
// name and type (the type string encodes the value domain, so matching it approximates the real
// editor's "value range matches" check). Consuming/first-match, mirrors the decompiled replace
// algorithm's per-jack "compatibility bucket" matching.
function buildIndexRemap(oldEntries: { name: string; type: string }[], newEntries: { name: string; type: string }[]): (number | null)[] {
	const consumed = new Set<number>();
	return newEntries.map((ne) => {
		const oldIdx = oldEntries.findIndex((oe, i) => !consumed.has(i) && oe.name.toLowerCase() === ne.name.toLowerCase() && oe.type === ne.type);
		if (oldIdx === -1) return null;
		consumed.add(oldIdx);
		return oldIdx;
	});
}

export function remapParamValues(oldDef: ModuleDefinition, newDef: ModuleDefinition, oldValues: number[]): number[] {
	const oldParams: ModuleParam[] = oldDef.params ?? [];
	const newParams: ModuleParam[] = newDef.params ?? [];
	const remap = buildIndexRemap(oldParams, newParams);
	// Module-level defaults first: they include per-module presets (Vocoder bands) that per-param defaults miss.
	const defaults = getDefaultParamValues(newDef.id);
	return newParams.map((p, i) => {
		const oldIdx = remap[i];
		if (oldIdx !== null && oldValues[oldIdx] !== undefined) return oldValues[oldIdx];
		return defaults[i] ?? getParamDefault(p);
	});
}

export function remapModeValues(oldDef: ModuleDefinition, newDef: ModuleDefinition, oldModes: number[]): number[] {
	const oldModeDefs: ModuleMode[] = oldDef.modes ?? [];
	const newModeDefs: ModuleMode[] = newDef.modes ?? [];
	const remap = buildIndexRemap(oldModeDefs, newModeDefs);
	return newModeDefs.map((_, i) => {
		const oldIdx = remap[i];
		return oldIdx !== null && oldModes[oldIdx] !== undefined ? oldModes[oldIdx] : 0;
	});
}

type JackList = { name: string; colour: string }[];

function jackListFor(def: ModuleDefinition, kind: 'input' | 'output'): JackList {
	return (kind === 'input' ? def.inputs : def.outputs) ?? [];
}

// Finds the first not-yet-consumed jack in `jacks` matching `name`+`colour`. Mutates `consumed`.
function findAndConsumeJack(jacks: JackList, consumed: Set<number>, name: string, colour: string): number | null {
	const idx = jacks.findIndex((j, i) => !consumed.has(i) && j.name.toLowerCase() === name.toLowerCase() && j.colour === colour);
	if (idx === -1) return null;
	consumed.add(idx);
	return idx;
}

// Remaps cables touching `moduleId` from `oldDef`'s jack layout to `newDef`'s, by name+colour,
// consuming/first-match. A cable whose `moduleId`-side endpoint has no equivalent jack on the new
// module is dropped (mirrors the real editor's silent-drop-if-unmapped behaviour). The non-
// `moduleId` endpoint of a cable is left untouched.
export function remapCablesForModule(cables: Cable[], moduleId: number, oldDef: ModuleDefinition, newDef: ModuleDefinition): Cable[] {
	const consumedInputs = new Set<number>();
	const consumedOutputs = new Set<number>();
	const newInputs = jackListFor(newDef, 'input');
	const newOutputs = jackListFor(newDef, 'output');
	const oldInputs = jackListFor(oldDef, 'input');
	const oldOutputs = jackListFor(oldDef, 'output');

	// Memoised per old connector so every cable on the same old jack (fan-out) maps to the same new jack.
	const mapped = new Map<string, number | null>();

	function remapEnd(mod: number, con: number, kind: 'input' | 'output'): number | null {
		if (mod !== moduleId) return con;
		const key = `${kind}:${con}`;
		if (mapped.has(key)) return mapped.get(key)!;
		const oldJack = (kind === 'input' ? oldInputs : oldOutputs)[con];
		const consumed = kind === 'input' ? consumedInputs : consumedOutputs;
		const newJacks = kind === 'input' ? newInputs : newOutputs;
		const result = oldJack ? findAndConsumeJack(newJacks, consumed, oldJack.name, oldJack.colour) : null;
		mapped.set(key, result);
		return result;
	}

	const result: Cable[] = [];
	for (const c of cables) {
		const isStrap = (c.dir ?? 1) === 0;
		const sKind: 'input' | 'output' = isStrap ? 'input' : 'output';
		const newScon = remapEnd(c.smod, c.scon, sKind);
		const newDcon = remapEnd(c.dmod, c.dcon, 'input');
		if (newScon === null || newDcon === null) continue;
		result.push({ ...c, scon: newScon, dcon: newDcon });
	}
	return result;
}
