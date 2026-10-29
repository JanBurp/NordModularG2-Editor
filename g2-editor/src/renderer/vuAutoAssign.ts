// "Assign VU meters" (Parameter Pages context menu): which of a patch's level meters go on which
// Parameter Page row. Pure, so the layout rules are unit-testable.

import type { Cable, ModuleDefinition, ModuleInstance, Patch } from '../types';
import { getModule } from './nmg2mods';
import { KNOBS_PER_PAGE } from './paramPages';
import { vuMetersByLedNo } from '../utils/vuLevel';
import { matchesCableJack } from '../store/slotHelpers';

export type MeterTarget = { location: 0 | 1; moduleIndex: number; ledNo: number };

type Category = 'inputs' | 'other' | 'outputs';
const CATEGORIES: Category[] = ['inputs', 'other', 'outputs'];

// In/Out modules: the input modules (2-In, 4-In, Fx-In) only have outputs, the output modules
// (2-Out, 4-Out) only inputs. Everything else with a meter (mixers, EQs, filters) is "other".
function categoryOf(def: ModuleDefinition): Category {
	if (def.page?.name !== 'In/Out') return 'other';
	return def.outputs?.length ? 'inputs' : 'outputs';
}

// Is the jack this meter measures connected? In/Out modules: meter N (by x) sits above jack N (by x),
// the outputs of an input module and the inputs of an output module. Other modules: any cable on
// the module counts.
function isMeterConnected(mod: ModuleInstance, def: ModuleDefinition, ledNo: number, cables: Cable[]): boolean {
	const category = categoryOf(def);
	if (category === 'other') return cables.some((c) => c.smod === mod.index || c.dmod === mod.index);
	const type = category === 'inputs' ? 'output' : 'input';
	const jacks = (category === 'inputs' ? def.outputs : def.inputs) ?? [];
	const byX = jacks.map((j, connectorIndex) => ({ x: j.x, connectorIndex })).sort((a, b) => a.x - b.x);
	const jack = byX[ledNo];
	return !!jack && cables.some((c) => matchesCableJack(c, mod.index, jack.connectorIndex, type));
}

// One area's connected meters per category, modules in column then top-to-bottom order.
function areaMeters(patch: Patch, location: 0 | 1): MeterTarget[][] {
	const area = patch.areas[location];
	const groups: Record<Category, MeterTarget[]> = { inputs: [], other: [], outputs: [] };
	const modules = [...(area?.modules ?? [])].sort((a, b) => a.horiz - b.horiz || a.vert - b.vert);
	for (const mod of modules) {
		const def = getModule(mod.type);
		if (!def) continue;
		vuMetersByLedNo(def).forEach((_, ledNo) => {
			if (isMeterConnected(mod, def, ledNo, area.cableList)) groups[categoryOf(def)].push({ location, moduleIndex: mod.index, ledNo });
		});
	}
	return CATEGORIES.map((c) => groups[c]);
}

// Packs categories into rows of KNOBS_PER_PAGE without splitting one across rows when it fits on
// a fresh row; a category longer than a row is chunked.
function packRows(categories: MeterTarget[][]): MeterTarget[][] {
	const rows: MeterTarget[][] = [];
	let row: MeterTarget[] = [];
	for (const cat of categories) {
		if (row.length + cat.length <= KNOBS_PER_PAGE) {
			row.push(...cat);
			continue;
		}
		if (row.length) rows.push(row);
		let rest = cat;
		while (rest.length > KNOBS_PER_PAGE) {
			rows.push(rest.slice(0, KNOBS_PER_PAGE));
			rest = rest.slice(KNOBS_PER_PAGE);
		}
		row = [...rest];
	}
	if (row.length) rows.push(row);
	return rows;
}

// The connected meters, in order Voice inputs/other/outputs then FX inputs/other/outputs, as rows
// of at most 8 knobs: one row when they all fit, else Voice and FX on separate rows, each split
// further at category boundaries when it doesn't fit a row.
export function meterRows(patch: Patch): MeterTarget[][] {
	const voice = areaMeters(patch, 1);
	const fx = areaMeters(patch, 0);
	const all = [...voice, ...fx].flat();
	if (all.length === 0) return [];
	if (all.length <= KNOBS_PER_PAGE) return [all];
	return [...packRows(voice), ...packRows(fx)];
}
