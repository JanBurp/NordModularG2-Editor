import type { ClipboardEntry, Patch, VariationState } from '@/types/patch';
import { MORPH_NAMES } from '@/types/patch';
import { extractVariations, liveModuleLv } from '../store/slotHelpers';
import { getModule } from '../renderer/nmg2mods';
import { PAGE_LETTERS, slotIndexToBankPageKnob } from '../renderer/paramPages';
import { PatchParser, stripFileHeader } from './nmg2PatchParser';
import { PCH2_TEXT_HEADER, pch2FileBytes, serializePatch } from './nmg2PatchSerializer';

// A library item is a plain .pch2 holding one area's modules, cables and morphs, moved to the top-left
// corner — the same format as cube-g2-editor's Building Blocks, so any patch file can be inserted as one.

// `base` is the slot the selection came from: its template and patch settings fill the rest of the file.
// `text` becomes the patch notes (formatNotes). The modules' knob, MIDI CC and morph assignments are kept.
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
	const patch: Patch = { ...base.patch, areas, controllers: entry.midi ?? [], paramPages: entry.knobs ?? [], text };
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
export type LibraryEntry = ClipboardEntry & { text: string; notes: LibraryNotes };

// The notes start with a header of [key: value] lines, then free text (`body`):
//   [author:] [license:] [source:] [tags: delay, fx] [assignments: knobs:[...], morphs:[...], midi:[...]]
// The assignments line is generated from the file's own assignments (assignmentsLine), never read back.
export type LibraryNotes = { author: string; license: string; source: string; tags: string[]; body: string };
const HEADER = /^\[(author|license|source|tags|assignments):\s*(.*?)\s*\]\s*$/;

export function parseNotes(text: string): LibraryNotes {
	const notes: LibraryNotes = { author: '', license: '', source: '', tags: [], body: '' };
	const lines = text.split(/\r?\n/);
	let i = 0;
	for (let m; i < lines.length && (m = HEADER.exec(lines[i])); i++) {
		if (m[1] === 'tags') notes.tags = splitTags(m[2]);
		else if (m[1] !== 'assignments') notes[m[1] as 'author' | 'license' | 'source'] = m[2];
	}
	notes.body = lines.slice(i).join('\n').trim();
	return notes;
}

export const splitTags = (s: string) => [
	...new Set(
		s
			.split(',')
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean),
	),
];

export function formatNotes(notes: LibraryNotes, assignments: string): string {
	const line = (key: string, value: string) => `[${key}:${value ? ` ${value}` : ''}]`;
	const header = [
		line('author', notes.author.trim()),
		line('license', notes.license.trim()),
		line('source', notes.source.trim()),
		line('tags', notes.tags.join(', ')),
		line('assignments', assignments),
	];
	return [...header, ...(notes.body.trim() ? ['', notes.body.trim()] : [])].join('\n');
}

// One label per knob, MIDI CC and (per variation) morph assignment: "1A1 Osc1.Pitch", "CC7 Mix1.Lev",
// "Wheel Flt1.Freq" — bank+page+knob, CC number or morph group, then the module's name and the param's.
export function assignmentLabels(entry: ClipboardEntry): { knobs: string[]; morphs: string[][]; midi: string[] } {
	const names = new Map(entry.modules.map((m) => [m.index, m]));
	const target = (moduleIndex: number, paramIndex: number, isLed = 0) => {
		const m = names.get(moduleIndex);
		const def = m && getModule(m.type);
		const param = isLed ? `LED${paramIndex + 1}` : (def?.params?.[paramIndex]?.name ?? `P${paramIndex + 1}`);
		return `${m?.uname || def?.short || moduleIndex}.${param}`;
	};
	return {
		knobs: (entry.knobs ?? []).map((k) => {
			const { bank, page, knob } = slotIndexToBankPageKnob(k.slotIndex);
			return `${bank + 1}${PAGE_LETTERS[page]}${knob + 1} ${target(k.moduleIndex, k.paramIndex, k.isLed)}`;
		}),
		morphs: (entry.morphs ?? []).map((list) => list.map((a) => `${MORPH_NAMES[a.groupIndex]} ${target(a.moduleIndex, a.paramIndex)}`)),
		midi: (entry.midi ?? []).map((c) => `CC${c.cc} ${target(c.moduleIndex, c.paramIndex)}`),
	};
}

// "knobs:[1A1 Osc1.Pitch], morphs:[Wheel Flt1.Freq], midi:[CC7 Mix1.Lev]". A morph set in several variations is listed once.
export function assignmentsLine(entry: ClipboardEntry): string {
	const { knobs, morphs, midi } = assignmentLabels(entry);
	return `knobs:[${knobs.join(', ')}], morphs:[${[...new Set(morphs.flat())].join(', ')}], midi:[${midi.join(', ')}]`;
}

// The voice area's modules, or the FX area's when the voice area is empty (items saved here hold one area).
export function pch2ToLibraryItem(bytes: number[]): LibraryEntry {
	const patch = new PatchParser(new Uint8Array(bytes).buffer).parse() as Patch;
	const areaIdx = patch.areas[1].modules.length > 0 ? 1 : 0;
	const areaKey = areaIdx === 1 ? 'voice' : 'fx';
	const variations = extractVariations(patch);
	const modules = patch.areas[areaIdx].modules.map((m) => ({ ...m, lv: liveModuleLv(m, variations, areaKey) }));
	const ids = new Set(modules.map((m) => m.index));
	const ofItem = (a: { location: number; moduleIndex: number }) => a.location === areaIdx && ids.has(a.moduleIndex);
	return {
		modules,
		cables: patch.areas[areaIdx].cableList ?? [],
		area: areaIdx === 1 ? 'va' : 'fx',
		copiedVariation: patch.description?.variation ?? 0,
		morphs: variations.map((v) => v.patch.morphAssignments.filter(ofItem)),
		knobs: (patch.paramPages ?? []).filter(ofItem),
		midi: (patch.controllers ?? []).filter(ofItem),
		text: patch.text ?? '',
		notes: parseNotes(patch.text ?? ''),
	};
}

// A library item's file with new patch notes (and name); everything else as it was.
export function withNotes(bytes: number[], name: string, notes: LibraryNotes): number[] {
	const patch = new PatchParser(new Uint8Array(bytes).buffer).parse() as Patch;
	patch.text = formatNotes(notes, assignmentsLine(pch2ToLibraryItem(bytes)));
	return pch2FileBytes(PCH2_TEXT_HEADER, serializePatch(name, patch, stripFileHeader(bytes), extractVariations(patch)));
}
