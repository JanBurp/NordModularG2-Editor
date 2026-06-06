import type { Cable } from '@/renderer/cableRenderer';
import type { ModuleInstance, Patch, PatchParamVariation, VariationState } from '@/types';
import { NUM_VARIATIONS } from '@/types';

export function areaConfig(area: 'voice' | 'fx'): { areaIdx: 0 | 1; location: 'va' | 'fx' } {
	return area === 'voice' ? { areaIdx: 1, location: 'va' } : { areaIdx: 0, location: 'fx' };
}

export function findModuleByIndex(modules: ModuleInstance[], id: number): ModuleInstance | undefined {
	return modules.find((m) => m.index === id);
}

export function matchesCableJack(c: Cable, moduleIndex: number, connectorIndex: number, type: 'input' | 'output'): boolean {
	if (type === 'output') return (c.dir ?? 1) === 1 && c.smod === moduleIndex && c.scon === connectorIndex;
	return (
		((c.dir ?? 1) === 1 && c.dmod === moduleIndex && c.dcon === connectorIndex) ||
		((c.dir ?? 1) === 0 && ((c.smod === moduleIndex && c.scon === connectorIndex) || (c.dmod === moduleIndex && c.dcon === connectorIndex)))
	);
}

function defaultPatchParams(): PatchParamVariation {
	return { patchVol: 100, activeMuted: 1, glide: 0, glideTime: 0, bend: 0, semi: 0, vibrato: 0, cents: 0, rate: 0, arpeggiator: 0, arpTime: 0, arpType: 0, octaveShift: 0, sustain: 0, octaves: 0, morphDials: [0,0,0,0,0,0,0,0], morphModes: [0,0,0,0,0,0,0,0] };
}

export function extractVariations(patch: Patch): VariationState[] {
	return Array.from({ length: NUM_VARIATIONS }, (_, v) => ({
		fx: Object.fromEntries(
			(patch.areas[0]?.modules ?? []).filter((m) => m.pcnt > 0).map((m) => [
				m.index,
				Array.from({ length: m.pcnt }, (_, p) => m.lv[v * m.pcnt + p] ?? 0),
			]),
		),
		voice: Object.fromEntries(
			(patch.areas[1]?.modules ?? []).filter((m) => m.pcnt > 0).map((m) => [
				m.index,
				Array.from({ length: m.pcnt }, (_, p) => m.lv[v * m.pcnt + p] ?? 0),
			]),
		),
		patch: patch.patchParams?.[v] ? { ...patch.patchParams[v] } : defaultPatchParams(),
	}));
}


export function removeModuleFromVariations(variations: VariationState[] | null, moduleId: number, areaKey: 'fx' | 'voice'): void {
	if (!variations) return;
	for (const v of variations) delete v[areaKey][moduleId];
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
