import type { ClipboardEntry, Patch } from '@/types/patch';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { PatchParser, stripFileHeader } from '../nmg2PatchParser';
import { libraryItemToPch2, pch2ToLibraryItem } from '../libraryFile';
import { extractVariations, liveModuleLv } from '../../store/slotHelpers';

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

	it('reads a whole patch file as a library item of its voice area', () => {
		const { bytes, patch } = loadFixture('DXBass FM4.pch2');
		const item = pch2ToLibraryItem(bytes);
		expect(item.area).toBe('va');
		expect(item.modules.map((m) => m.index)).toEqual(patch.areas[1].modules.map((m) => m.index));
		expect(item.cables.length).toBe(patch.areas[1].cableList.length);
	});
});
