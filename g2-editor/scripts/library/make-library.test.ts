// Builds the Library pane's starter items from library.json: either cut out of an existing .pch2 (`source` + module
// indices) or rebuilt from a module/cable list. Every item is checked by reading it back; with G2_LIBRARY_OUT set it
// is also written to <G2_LIBRARY_OUT>/<folder>/<name>.pch2. Extracted items need G2_LIBRARY_SRC (the folder holding
// RolandKuit/ and electro-music-blocks/) and are skipped without it. See vitest.config.ts in this folder.
import type { Cable, ClipboardEntry, ModuleInstance, Patch } from '@/types/patch';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import manifest from './library.json';
import { PatchParser, stripFileHeader } from '@/parser/nmg2PatchParser';
import { libraryItemToPch2, pch2ToLibraryItem } from '@/parser/libraryFile';
import { computeUprateSet } from '@/parser/cableGraph';
import { getAllModules, getModule } from '@/renderer/nmg2mods';
import { formatValue } from '@/utils/moduleControls';
import { jackColorNameToIndex } from '@/constants/cableColors';
import { extractVariations, liveModuleLv, newModuleInstance } from '@/store/slotHelpers';

type Value = number | string;
type RebuildModule = { id: string; type: string; name?: string; col?: number; params?: Record<string, Value>; modes?: Record<string, Value> };
type Entry = {
	name: string;
	folder: string;
	credit: string;
	source?: string;
	area?: 'va' | 'fx';
	// 'coloured': every module whose colour isn't the default (authors who colour their block, grey demo); `exclude` drops some.
	modules: number[] | 'all' | 'coloured' | RebuildModule[];
	exclude?: number[];
	cables?: string[][];
};

const SRC = process.env.G2_LIBRARY_SRC;
const OUT = process.env.G2_LIBRARY_OUT;
const EMPTY_PATCH = path.resolve(__dirname, '../../resources/patches/EmptyPatch.pch2');

function loadPatch(file: string): { patch: Patch; templateRawHex: string } {
	const bytes = Array.from(fs.readFileSync(file));
	return { patch: new PatchParser(new Uint8Array(bytes).buffer).parse() as Patch, templateRawHex: stripFileHeader(bytes) };
}

// Display values ("987.8Hz", "12.7m", "BP") are matched against the editor's own formatting of every raw value.
function toNumber(s: string): number | null {
	const m = s.replace(/\s/g, '').match(/^(-?[\d.]+)(k|m)?/i);
	if (!m) return null;
	return parseFloat(m[1]) * (m[2] === 'k' ? 1000 : m[2] === 'm' ? 0.001 : 1);
}

function resolveValue(type: string, spec: Value): number {
	if (typeof spec === 'number') return spec;
	const shown = Array.from({ length: 128 }, (_, raw) => formatValue(raw, type));
	const exact = shown.findIndex((s) => s.replace(/\s/g, '').toLowerCase() === spec.replace(/\s/g, '').toLowerCase());
	if (exact >= 0) return exact;
	const want = toNumber(spec);
	if (want === null) throw new Error(`No value "${spec}" for ${type}`);
	let best = 0;
	shown.forEach((s, raw) => {
		const n = toNumber(s);
		const b = toNumber(shown[best]);
		if (n !== null && (b === null || Math.abs(n - want) < Math.abs(b - want))) best = raw;
	});
	return best;
}

function extract(entry: Entry): { entry: ClipboardEntry; base: ReturnType<typeof loadPatch> & { variations: ReturnType<typeof extractVariations> } } {
	const base = loadPatch(path.join(SRC!, entry.source!));
	const areaIdx = entry.area === 'fx' ? 0 : 1;
	const areaKey = areaIdx === 1 ? 'voice' : 'fx';
	const variations = extractVariations(base.patch);
	const all = base.patch.areas[areaIdx].modules;
	const picked =
		entry.modules === 'all'
			? all.map((m) => m.index)
			: entry.modules === 'coloured'
				? all.filter((m) => m.colour !== 0).map((m) => m.index)
				: (entry.modules as number[]);
	const ids = new Set(picked.filter((i) => !entry.exclude?.includes(i)));
	const modules = all.filter((m) => ids.has(m.index)).map((m) => ({ ...m, lv: liveModuleLv(m, variations, areaKey) }));
	expect(modules.map((m) => m.index).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b)); // every index exists
	return {
		entry: {
			modules,
			cables: base.patch.areas[areaIdx].cableList.filter((c) => ids.has(c.smod) && ids.has(c.dmod)),
			area: areaIdx === 1 ? 'va' : 'fx',
			copiedVariation: 0,
			morphs: variations.map((v) => v.patch.morphAssignments.filter((a) => a.location === areaIdx && ids.has(a.moduleIndex))),
		},
		base: { ...base, variations },
	};
}

function rebuild(entry: Entry): { entry: ClipboardEntry; base: ReturnType<typeof loadPatch> & { variations: ReturnType<typeof extractVariations> } } {
	const base = loadPatch(EMPTY_PATCH);
	const specs = entry.modules as RebuildModule[];
	const rows = new Map<number, number>(); // next free row per column
	const modules: ModuleInstance[] = [];
	const byId = new Map<string, ModuleInstance>();
	specs.forEach((spec, i) => {
		const def = getAllModules().find((d) => d.short === spec.type);
		if (!def) throw new Error(`Unknown module type ${spec.type}`);
		const col = spec.col ?? 0;
		const row = rows.get(col) ?? 0;
		rows.set(col, row + def.height);
		const mod = newModuleInstance(def.id, i + 1, col, row, 0, modules);
		if (spec.name) mod.uname = spec.name;
		for (const [name, value] of Object.entries(spec.params ?? {})) {
			const p = def.params.findIndex((q) => q.name === name);
			if (p < 0) throw new Error(`${spec.type} has no param ${name}`);
			const raw = resolveValue(def.params[p].type, value);
			for (let v = 0; v * mod.pcnt < mod.lv.length; v++) mod.lv[v * mod.pcnt + p] = raw;
		}
		for (const [name, value] of Object.entries(spec.modes ?? {})) {
			const m = (def.modes ?? []).findIndex((q: { name: string }) => q.name === name);
			if (m < 0) throw new Error(`${spec.type} has no mode ${name}`);
			mod.modes[m] = resolveValue((def.modes as { type: string }[])[m].type, value);
		}
		modules.push(mod);
		byId.set(spec.id, mod);
	});
	// "id.Jack": an output when the module has one by that name, else an input (an input-to-input link).
	const cables: Cable[] = (entry.cables ?? []).map(([from, to]) => {
		const [fid, fjack] = from.split(/\.(.+)/);
		const [tid, tjack] = to.split(/\.(.+)/);
		const src = byId.get(fid)!;
		const dst = byId.get(tid)!;
		const sdef = getModule(src.type)!;
		const out = sdef.outputs.findIndex((o) => o.name === fjack);
		const scon = out >= 0 ? out : sdef.inputs.findIndex((o) => o.name === fjack);
		const dcon = getModule(dst.type)!.inputs.findIndex((o) => o.name === tjack);
		if (scon < 0 || dcon < 0) throw new Error(`Bad cable ${from} -> ${to}`);
		const colour = out >= 0 ? sdef.outputs[out].colour : sdef.inputs[scon].colour;
		return { colour: jackColorNameToIndex(colour), smod: src.index, scon, dir: out >= 0 ? 1 : 0, dmod: dst.index, dcon };
	});
	const uprate = computeUprateSet(
		cables,
		modules.map((m) => ({ index: m.index, def: getModule(m.type)! })),
	);
	for (const m of modules) m.uprate = uprate.has(m.index) ? 1 : 0;
	const area = entry.area ?? 'va';
	return {
		entry: { modules, cables, area, copiedVariation: 0, morphs: [] },
		base: { ...base, variations: extractVariations(base.patch) },
	};
}

describe('library items', () => {
	for (const entry of manifest as Entry[]) {
		const isExtract = !!entry.source;
		it.skipIf(isExtract && !SRC)(`${entry.folder}/${entry.name}`, () => {
			const { entry: item, base } = isExtract ? extract(entry) : rebuild(entry);
			const bytes = libraryItemToPch2(entry.name, item, base, entry.credit);
			const back = pch2ToLibraryItem(bytes);
			expect(back.modules.length).toBe(item.modules.length);
			expect(back.cables.length).toBe(item.cables.length);
			expect(back.area).toBe(item.area);
			if (OUT) {
				const dir = path.join(OUT, entry.folder);
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(path.join(dir, `${entry.name}.pch2`), Buffer.from(bytes));
			}
		});
	}
});
