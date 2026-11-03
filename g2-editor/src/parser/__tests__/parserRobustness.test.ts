import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { PatchParser } from '../nmg2PatchParser';
import { SectionType } from '../constants';
import { fileCrcOk, serializePatch, TEXT_PAD_MAX, writePerfSettings } from '../nmg2PatchSerializer';
import { extractVariations } from '../../store/slotHelpers';
import { stripFileHeader } from '../nmg2PatchParser';
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
			slots.map((s) => ({
				active: true,
				key: s.key,
				hold: s.hold,
				bank: s.bank,
				patch: s.patch,
				rangeLow: s.range.lower,
				rangeHigh: s.range.upper,
				midiChannel: s.midiChannel,
			})),
		);
	});

	it('does not throw on a file shorter than the 320-byte header window', () => {
		const short = new Uint8Array([...new TextEncoder().encode('x\r\n'), 0, 0x17, 0x00, 0, 0]);
		expect(() => new PatchParser(short.buffer).parse()).not.toThrow();
	});

	it('checks the file CRC: real files pass, one flipped byte fails', () => {
		for (const file of ['EmptyPatch.pch2', 'Clavia demo.pch2', 'EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
			const bytes = readFixture(file);
			expect(fileCrcOk(bytes), file).toBe(true);
			bytes[sectionsStart(bytes) + 5] ^= 0x01;
			expect(fileCrcOk(bytes), file).toBe(false);
		}
		// Saved by an older build with a wrong CRC; it still parses (the load only warns).
		const damaged = readFixture('eigen/PianoB.pch2');
		expect(fileCrcOk(damaged)).toBe(false);
		expect(() => new PatchParser(damaged.buffer).parse()).not.toThrow();
		expect(fileCrcOk(new Uint8Array([0x78, 0x00, 0x17]))).toBe(false);
	});

	it('reads patch settings (0x4d area 2) by entry index and count, like the official generic reader', () => {
		const file = 'Clavia demo.pch2';
		const bytes = readFixture(file);
		const original = new PatchParser(bytes.buffer).parse();
		const pp = original.patchParams!;
		const groups: Record<number, number[][]> = {
			1: pp.map((v) => [...v.morphDials, ...v.morphModes]),
			2: pp.map((v) => [v.patchVol, v.activeMuted]),
			3: pp.map((v) => [v.glide, v.glideTime]),
			4: pp.map((v) => [v.bend, v.semi]),
			5: pp.map((v) => [v.vibrato, v.cents, v.rate, 99]), // one value more than known
			6: pp.map((v) => [v.arpeggiator, v.arpTime, v.arpType, v.octaves]),
			7: pp.map((v) => [v.octaveShift, v.sustain]),
			9: pp.map(() => [5, 6]), // an entry index no one knows
		};
		const order = [7, 2, 9, 1, 5, 3, 6, 4];
		const bits: number[] = [];
		const put = (n: number, v: number) => {
			for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
		};
		put(2, 2);
		put(8, order.length);
		put(8, pp.length);
		for (const id of order) {
			put(8, id);
			put(7, groups[id][0].length);
			groups[id].forEach((vals, v) => {
				put(8, v);
				vals.forEach((x) => put(7, x));
			});
		}
		while (bits.length % 8) bits.push(0);
		const data = Array.from({ length: bits.length / 8 }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8).join(''), 2));
		const old = sections(bytes).find((x) => x.type === SectionType.PARAMETERS && bytes[x.ofs + 3] >> 6 === 2)!;
		const patched = new Uint8Array([
			...bytes.slice(0, old.ofs),
			SectionType.PARAMETERS,
			data.length >> 8,
			data.length & 0xff,
			...data,
			...bytes.slice(old.end),
		]);

		const parsed = new PatchParser(patched.buffer).parse();
		expect(parsed.patchParams).toEqual(pp);
		for (const a of [0, 1]) {
			expect(parsed.areas[a].modules.map(moduleFields)).toEqual(original.areas[a].modules.map(moduleFields));
			expect(parsed.areas[a].cableList).toEqual(original.areas[a].cableList);
		}
	});

	it('caps a slot patch text pad at 1024 bytes like the official writer; a library file keeps it whole', () => {
		const bytes = readFixture('EmptyPatch.pch2');
		const patch = new PatchParser(bytes.buffer).parse();
		patch.text = 'x'.repeat(1500);
		const textLens = (rawHex: string) => {
			const out = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
			const file = new Uint8Array([...new TextEncoder().encode('x'), 0, 0x17, 0, ...out]);
			return sections(file)
				.filter((x) => x.type === SectionType.SEPARATOR)
				.map((x) => x.end - x.ofs - 3);
		};
		const template = stripFileHeader(bytes);
		expect(textLens(serializePatch('p', patch, template, extractVariations(patch)))).toEqual([TEXT_PAD_MAX]);
		expect(textLens(serializePatch('p', patch, template, extractVariations(patch), Infinity))).toEqual([1500]);
	});
});
