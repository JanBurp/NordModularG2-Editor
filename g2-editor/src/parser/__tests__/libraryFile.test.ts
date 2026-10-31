import type { ClipboardEntry, Patch } from '@/types/patch';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { PatchParser, stripFileHeader } from '../nmg2PatchParser';
import { assignmentsLine, formatNotes, libraryItemToPch2, parseNotes, pch2ToLibraryItem, withNotes } from '../libraryFile';
import { extractVariations, liveModuleLv } from '../../store/slotHelpers';
import { getModule } from '../../renderer/nmg2mods';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../../../test-patches');

function loadFixture(filename: string): { bytes: number[]; patch: Patch } {
	const bytes = Array.from(fs.readFileSync(path.join(FIXTURES, filename)));
	return { bytes, patch: new PatchParser(new Uint8Array(bytes).buffer).parse() as Patch };
}

describe('library item .pch2', () => {
	it('round-trips a selection: modules moved to (0,0), internal cables, params and morphs only', () => {
		const { bytes, patch } = loadFixture('Basics  NL2.pch2');
		const variations = extractVariations(patch);
		const area = patch.areas[1];
		// Two modules joined by a cable; a third module's cables to them must be dropped.
		const cable = area.cableList[0];
		const ids = new Set([cable.smod, cable.dmod]);
		const modules = area.modules.filter((m) => ids.has(m.index)).map((m) => ({ ...m, lv: liveModuleLv(m, variations, 'voice') }));
		// The fixture has no morphs on these modules: assign one in variation 2.
		const target = modules.find((m) => m.pcnt > 0)!;
		const morphs = variations.map((_, v) =>
			v === 2 ? [{ groupIndex: 3, location: 1 as const, moduleIndex: target.index, paramIndex: 0, range: 40 }] : [],
		);
		const entry: ClipboardEntry = {
			modules,
			cables: area.cableList.filter((c) => ids.has(c.smod) && ids.has(c.dmod)),
			area: 'va',
			copiedVariation: 0,
			morphs,
		};

		const item = pch2ToLibraryItem(libraryItemToPch2('Item', entry, { patch, templateRawHex: stripFileHeader(bytes), variations }));

		expect(item.area).toBe('va');
		const minCol = Math.min(...modules.map((m) => m.horiz));
		const minRow = Math.min(...modules.map((m) => m.vert));
		const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index;
		expect(
			item.modules
				.map((m) => ({ index: m.index, type: m.type, horiz: m.horiz, vert: m.vert, colour: m.colour, lv: m.lv.slice(0, 9 * m.pcnt) }))
				.sort(byIndex),
		).toEqual(
			modules
				.map((m) => ({ index: m.index, type: m.type, horiz: m.horiz - minCol, vert: m.vert - minRow, colour: m.colour, lv: m.lv.slice(0, 9 * m.pcnt) }))
				.sort(byIndex),
		);
		expect(item.cables.map((c) => [c.smod, c.scon, c.dmod, c.dcon])).toEqual(entry.cables.map((c) => [c.smod, c.scon, c.dmod, c.dcon]));
		expect(item.morphs!.slice(0, 9)).toEqual(morphs.slice(0, 9));
	});

	it("keeps the selection's knob and MIDI CC assignments, and lists them in the assignments line", () => {
		const { bytes, patch } = loadFixture('Basics  NL2.pch2');
		const variations = extractVariations(patch);
		const m = patch.areas[1].modules.find((x) => x.pcnt > 0)!;
		const knobs = [{ slotIndex: 24 + 8 + 2, location: 1 as const, moduleIndex: m.index, paramIndex: 0, isLed: 0 }]; // bank 2, page B, knob 3
		const midi = [{ cc: 7, location: 1 as const, moduleIndex: m.index, paramIndex: 0 }];
		const morphs = variations.map((_, v) => (v < 2 ? [{ groupIndex: 0, location: 1 as const, moduleIndex: m.index, paramIndex: 0, range: 10 }] : []));
		const entry: ClipboardEntry = {
			modules: [{ ...m, lv: liveModuleLv(m, variations, 'voice') }],
			cables: [],
			area: 'va',
			copiedVariation: 0,
			morphs,
			knobs,
			midi,
		};

		const item = pch2ToLibraryItem(libraryItemToPch2('Item', entry, { patch, templateRawHex: stripFileHeader(bytes), variations }));

		expect(item.knobs).toEqual(knobs);
		expect(item.midi).toEqual(midi);
		const target = `${m.uname}.${getModule(m.type)!.params![0].name}`;
		expect(assignmentsLine(item)).toBe(`knobs:[2B3 ${target}], morphs:[Wheel ${target}], midi:[CC7 ${target}]`);
	});

	it('reads a whole patch file as a library item of its voice area', () => {
		const { bytes, patch } = loadFixture('DXBass FM4.pch2');
		const item = pch2ToLibraryItem(bytes);
		expect(item.area).toBe('va');
		expect(item.modules.map((m) => m.index)).toEqual(patch.areas[1].modules.map((m) => m.index));
		expect(item.cables.length).toBe(patch.areas[1].cableList.length);
	});

	it('withNotes replaces only the notes, with a generated assignments line', () => {
		const { bytes } = loadFixture('DXBass FM4.pch2');
		const before = pch2ToLibraryItem(bytes);
		const notes = { author: 'Me', license: '', source: '', tags: ['bass'], body: 'New notes\nline 2' };
		const after = pch2ToLibraryItem(withNotes(bytes, 'DXBass', notes));
		expect(after.text).toBe(formatNotes(notes, assignmentsLine(before)));
		expect(after.notes).toEqual(notes);
		expect(after.modules.map((m) => [m.index, m.type, m.horiz, m.vert, ...m.lv])).toEqual(
			before.modules.map((m) => [m.index, m.type, m.horiz, m.vert, ...m.lv]),
		);
		expect(after.cables).toEqual(before.cables);
		expect(after.morphs).toEqual(before.morphs);
	});

	it('parses and formats the notes header; notes without one are all body', () => {
		const text =
			'[author: Tim]\n[license:]\n[source: electro-music.org]\n[tags: delay, FX, delay]\n[assignments: knobs:[], morphs:[], midi:[]]\n\nEight taps.';
		const notes = parseNotes(text);
		expect(notes).toEqual({ author: 'Tim', license: '', source: 'electro-music.org', tags: ['delay', 'fx'], body: 'Eight taps.' });
		expect(formatNotes(notes, 'knobs:[], morphs:[], midi:[]')).toBe(
			'[author: Tim]\n[license:]\n[source: electro-music.org]\n[tags: delay, fx]\n[assignments: knobs:[], morphs:[], midi:[]]\n\nEight taps.',
		);
		expect(parseNotes('Just prose\n[tags: x]')).toEqual({ author: '', license: '', source: '', tags: [], body: 'Just prose\n[tags: x]' });
	});
});
