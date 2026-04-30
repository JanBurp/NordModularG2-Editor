import type { Patch, ModuleInstance, Cable } from "./nmg2PatchParser";

export function mutDeleteCable(
	patch: Patch,
	areaIdx: 0 | 1,
	cable: { smod: number; scon: number; dmod: number; dcon: number },
): void {
	const list = patch.areas[areaIdx].cableList ?? [];
	patch.areas[areaIdx].cableList = list.filter(
		(c) =>
			!(c.smod === cable.smod && c.scon === cable.scon &&
			  c.dmod === cable.dmod && c.dcon === cable.dcon),
	);
}

export function mutDeleteModule(patch: Patch, areaIdx: 0 | 1, moduleId: number): void {
	patch.areas[areaIdx].modules = patch.areas[areaIdx].modules.filter(
		(m) => m.index !== moduleId,
	);
	patch.areas[areaIdx].cableList = (patch.areas[areaIdx].cableList ?? []).filter(
		(c) => c.smod !== moduleId && c.dmod !== moduleId,
	);
}

export function mutMoveModule(
	patch: Patch,
	areaIdx: 0 | 1,
	moduleId: number,
	col: number,
	row: number,
): void {
	// Replace array (not in-place mutation) so Vue's non-deep reference watch on modules fires
	patch.areas[areaIdx].modules = patch.areas[areaIdx].modules.map((m) =>
		m.index === moduleId ? { ...m, horiz: col, vert: row } : m,
	);
}

export function mutAddModule(patch: Patch, areaIdx: 0 | 1, mod: ModuleInstance): void {
	// Replace array (not push) so Vue's non-deep reference watch on modules fires
	patch.areas[areaIdx].modules = [...patch.areas[areaIdx].modules, mod];
}

export function mutSetModuleColor(patch: Patch, areaIdx: 0 | 1, moduleId: number, color: number): void {
	patch.areas[areaIdx].modules = patch.areas[areaIdx].modules.map((m) =>
		m.index === moduleId ? { ...m, colour: color } : m,
	);
}

export function mutAddCable(patch: Patch, areaIdx: 0 | 1, cable: Cable): void {
	// Replace array (not push) so Vue's non-deep reference watch on cables fires
	patch.areas[areaIdx].cableList = [...(patch.areas[areaIdx].cableList ?? []), cable];
}
