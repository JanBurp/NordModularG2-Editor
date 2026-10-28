import type { ClipboardEntry, Patch, VariationState } from '@/types/patch';
import { extractVariations, liveModuleLv } from '../store/slotHelpers';
import { PatchParser, stripFileHeader } from './nmg2PatchParser';
import { PCH2_TEXT_HEADER, pch2FileBytes, serializePatch } from './nmg2PatchSerializer';

// A library item is a plain .pch2 holding one area's modules, cables and morphs, moved to the top-left
// corner — the same format as cube-g2-editor's Building Blocks, so any patch file can be inserted as one.

// `base` is the slot the selection came from: its template and patch settings fill the rest of the file.
// `text` becomes the patch notes (e.g. the item's author and source).
export function libraryItemToPch2(
	name: string,
	entry: ClipboardEntry,
	base: { patch: Patch; templateRawHex: string; variations: VariationState[] },
	text = '',
): number[] {
	const areaIdx = entry.area === 'va' ? 1 : 0;
	const areaKey = areaIdx === 1 ? 'voice' : 'fx';
	const minCol = Math.min(...entry.modules.map((m) => m.horiz));
	const minRow = Math.min(...entry.modules.map((m) => m.vert));
	const modules = entry.modules.map((m) => ({ ...m, horiz: m.horiz - minCol, vert: m.vert - minRow }));
	const areas = base.patch.areas.map((a, i) => ({
		...a,
		modules: i === areaIdx ? modules : [],
		cableList: i === areaIdx ? entry.cables.map((c) => ({ ...c })) : [],
	})) as Patch['areas'];
	const patch: Patch = { ...base.patch, areas, controllers: [], paramPages: [], text };
	const variations: VariationState[] = base.variations.map((v, i) => ({
		fx: {},
		voice: {},
		patch: { ...v.patch, morphAssignments: entry.morphs?.[i] ?? [] },
	}));
	for (const m of modules) {
		variations.forEach((v, i) => (v[areaKey][m.index] = m.lv.slice(i * m.pcnt, (i + 1) * m.pcnt)));
	}
	return pch2FileBytes(PCH2_TEXT_HEADER, serializePatch(name, patch, base.templateRawHex, variations));
}

// A library item as inserted (a clipboard entry) plus its patch notes.
export type LibraryEntry = ClipboardEntry & { text: string };

// The voice area's modules, or the FX area's when the voice area is empty (items saved here hold one area).
export function pch2ToLibraryItem(bytes: number[]): LibraryEntry {
	const patch = new PatchParser(new Uint8Array(bytes).buffer).parse() as Patch;
	const areaIdx = patch.areas[1].modules.length > 0 ? 1 : 0;
	const areaKey = areaIdx === 1 ? 'voice' : 'fx';
	const variations = extractVariations(patch);
	const modules = patch.areas[areaIdx].modules.map((m) => ({ ...m, lv: liveModuleLv(m, variations, areaKey) }));
	const ids = new Set(modules.map((m) => m.index));
	return {
		modules,
		cables: patch.areas[areaIdx].cableList ?? [],
		area: areaIdx === 1 ? 'va' : 'fx',
		copiedVariation: patch.description?.variation ?? 0,
		morphs: variations.map((v) => v.patch.morphAssignments.filter((a) => a.location === areaIdx && ids.has(a.moduleIndex))),
		text: patch.text ?? '',
	};
}

// A library item's file with new patch notes (and name); everything else as it was.
export function withNotes(bytes: number[], name: string, text: string): number[] {
	const patch = new PatchParser(new Uint8Array(bytes).buffer).parse() as Patch;
	patch.text = text;
	return pch2FileBytes(PCH2_TEXT_HEADER, serializePatch(name, patch, stripFileHeader(bytes), extractVariations(patch)));
}
