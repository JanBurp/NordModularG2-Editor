import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { PatchParser } from '../nmg2PatchParser';
import { SectionType } from '../constants';
import { writePerfSettings } from '../nmg2PatchSerializer';
import { getModule } from '../../renderer/nmg2mods';
import type { ModuleInstance } from '@/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../../../test-patches');

const readFixture = (file: string) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)));
const sectionsStart = (bytes: Uint8Array) => bytes.indexOf(0) + 3;

// File offsets of every top-level section of a .pch2/.prf2 (the trailing CRC is not a section).
function sections(bytes: Uint8Array): { type: number; ofs: number; end: number }[] {
	const out = [];
	for (let ofs = sectionsStart(bytes); ofs + 3 <= bytes.length - 2; ) {
		const end = ofs + 3 + ((bytes[ofs + 1] << 8) | bytes[ofs + 2]);
		out.push({ type: bytes[ofs], ofs, end });
		ofs = end;
	}
	return out;
}

function writeBits(bytes: Uint8Array, bitOfs: number, numBits: number, value: number): void {
	for (let i = 0; i < numBits; i++) {
		const bit = (value >> (numBits - 1 - i)) & 1;
		const pos = bitOfs + i;
		const mask = 0x80 >> (pos & 7);
		bytes[pos >> 3] = bit ? bytes[pos >> 3] | mask : bytes[pos >> 3] & ~mask;
	}
}

const moduleFields = (m: ModuleInstance) => ({
	index: m.index,
	type: m.type,
	horiz: m.horiz,
	vert: m.vert,
	colour: m.colour,
	uprate: m.uprate,
	mutaLock: m.mutaLock,
	modes: m.modes,
	lv: m.lv,
	uname: m.uname,
});

describe('parser robustness', () => {
	it('skips a module of unknown type in the middle of 0x4a and keeps every other module aligned', () => {
		const file = 'Clavia demo.pch2';
		const original = new PatchParser(readFixture(file).buffer).parse();
		const bytes = readFixture(file);

		// First module list with at least 3 modules; corrupt the type byte of its middle module.
		const lists = sections(bytes).filter((s) => s.type === SectionType.MODULE_LIST);
		const list = lists.find((s) => {
			const area = bytes[s.ofs + 3] >> 6;
			return original.areas[area].modules.length >= 3;
		})!;
		expect(list).toBeDefined();
		const area = bytes[list.ofs + 3] >> 6;
		const mods = original.areas[area].modules;
		const victim = Math.floor(mods.length / 2);
		let bitOfs = (list.ofs + 3) * 8 + 2 + 8;
		for (let i = 0; i < victim; i++) bitOfs += 8 + 8 + 7 + 7 + 8 + 1 + 1 + 6 + 4 + 6 * mods[i].modes.length;
		const unknownType = Array.from({ length: 256 }, (_, t) => 255 - t).find((t) => !getModule(t))!;
		writeBits(bytes, bitOfs, 8, unknownType);

		const parsed = new PatchParser(bytes.buffer).parse();
		const expected = mods.filter((_, i) => i !== victim).map(moduleFields);
		expect(parsed.areas[area].modules.map(moduleFields)).toEqual(expected);
		const other = 1 - area;
		expect(parsed.areas[other].modules.map(moduleFields)).toEqual(original.areas[other].modules.map(moduleFields));
		expect(parsed.areas[area].cableList).toEqual(original.areas[area].cableList);
		expect(parsed.patchParams).toEqual(original.patchParams);
	});

	it('reads a 16-character perf slot name (no NUL) without shifting the following slots', () => {
		const file = readFixture('EmptyPerf.prf2');
		const slots = (['A', 'B', 'C', 'D'] as const).map((slot, i) => ({
			slot,
			name: slot === 'B' ? '185stepsequencer' : `slot ${slot}`,
			active: true,
			key: i % 2 === 0,
			hold: i === 3,
			bank: i + 1,
			patch: 10 + i,
			range: { lower: 20 + i, upper: 100 + i },
			midiChannel: 9 + i,
		}));
		const perfData = writePerfSettings({ name: 'p', focus: 'A', rangeEnable: true, bpm: 120, clockRunning: false, category: 7, clockKbdTrig: true }, slots);
		const old = sections(file).find((s) => s.type === SectionType.PERF_DATA)!;
		const bytes = new Uint8Array([...file.slice(0, old.ofs), ...perfData, ...file.slice(old.end)]);

		const perf = new PatchParser(bytes.buffer).parsePrf2()!;
		expect(perf.slotNames).toEqual(slots.map((s) => s.name));
		expect(perf.settings).toMatchObject({ category: 7, clockKbdTrig: true, bpm: 120 });
		expect(perf.slotMeta).toEqual(
			slots.map((s) => ({ active: true, key: s.key, hold: s.hold, bank: s.bank, patch: s.patch, rangeLow: s.range.lower, rangeHigh: s.range.upper, midiChannel: s.midiChannel })),
		);
	});

	it('does not throw on a file shorter than the 320-byte header window', () => {
		const short = new Uint8Array([...new TextEncoder().encode('x\r\n'), 0, 0x17, 0x00, 0, 0]);
		expect(() => new PatchParser(short.buffer).parse()).not.toThrow();
	});
});
