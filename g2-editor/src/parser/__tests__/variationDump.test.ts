import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PatchParser } from '../nmg2PatchParser';
import { serializeVariationDump } from '../nmg2PatchSerializer';
import { SectionType } from '../constants';
import { extractVariations } from '../../store/slotHelpers';
import { MUTATOR_VARIATION } from '../../types/patch';

const FIXTURE = path.join(fileURLToPath(new URL('.', import.meta.url)), '../../../../test-patches/Analogue NL2.pch2');

describe('serializeVariationDump', () => {
	it('writes the official audition dump: patch settings, VA, FX, morphs — one variation each', () => {
		const b = fs.readFileSync(FIXTURE);
		const patch = new PatchParser(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).parse();
		const bytes = serializeVariationDump(patch, extractVariations(patch)[0], MUTATOR_VARIATION);

		const sections: { type: number; data: Uint8Array }[] = [];
		let ofs = 0;
		while (ofs < bytes.length) {
			const len = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
			sections.push({ type: bytes[ofs], data: bytes.slice(ofs + 3, ofs + 3 + len) });
			ofs += 3 + len;
		}
		expect(ofs).toBe(bytes.length);
		expect(sections.map((s) => s.type)).toEqual([SectionType.PARAMETERS, SectionType.PARAMETERS, SectionType.PARAMETERS, SectionType.MORPH_PARAMS]);
		// Parameters: 2-bit context (2 = patch settings, 1 = VA, 0 = FX), then module count, then variation count 1
		expect(sections.slice(0, 3).map((s) => s.data[0] >> 6)).toEqual([2, 1, 0]);
		// Morph section: variation count 1
		expect(sections[3].data[0]).toBe(1);
	});
});
