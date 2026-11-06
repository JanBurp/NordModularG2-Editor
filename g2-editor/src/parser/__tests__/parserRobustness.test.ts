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
import { convertSlotToCurrent, type ConvertSlot } from '../fileVersion';
import { currentFormatFile } from '../currentFormatFile';
import { defaultMutaLock } from '../../renderer/mutator';
import type { Cable, ModuleInstance, PatchParamVariation } from '@/types';

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

	it('writes a paramLen-0 label entry back as 2 bytes, as the official reader walks it', () => {
		const bytes = readFixture('Clavia demo.pch2');
		const template = stripFileHeader(bytes);
		const patch = new PatchParser(bytes.buffer).parse();
		const mod = patch.areas[1].modules.find((m) => (m.paramLabels?.length ?? 0) > 0)!;
		expect(mod).toBeDefined();
		const vaLabelsLen = (rawHex: string) => {
			const file = new Uint8Array([0x78, 0, 0x17, 0, ...rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))]);
			const sec = sections(file).find((x) => x.type === SectionType.PARAM_NAMES && file[x.ofs + 3] >> 6 === 1)!;
			return sec.end - sec.ofs - 3;
		};
		const before = vaLabelsLen(serializePatch('p', patch, template, extractVariations(patch)));
		mod.paramLabels = [...mod.paramLabels!, { paramIndex: 0, isString: false, paramLen: 0, labels: [] }];
		const out = serializePatch('p', patch, template, extractVariations(patch));
		expect(vaLabelsLen(out)).toBe(before + 2);
		const file = new Uint8Array([0x78, 0, 0x17, 0, ...out.match(/.{2}/g)!.map((b) => parseInt(b, 16))]);
		const back = new PatchParser(file.buffer).parse().areas[1].modules.find((m) => m.index === mod.index)!;
		expect(back.paramLabels).toEqual(mod.paramLabels);
	});

	it('gives an old-format file (v22) the official default mutation locks; a v23 file keeps its own', () => {
		const bytes = readFixture('Clavia demo.pch2');
		const versionAt = bytes.indexOf(0) + 1;
		expect(bytes[versionAt]).toBe(22);
		const converted = new PatchParser(bytes.buffer).parse();
		const mods = converted.areas.flatMap((a) => a.modules);
		expect(mods.map((m) => m.mutaLock)).toEqual(mods.map((m) => defaultMutaLock(m.type)));

		const asV23 = bytes.slice();
		asV23[versionAt] = 0x17;
		const kept = new PatchParser(asV23.buffer).parse().areas.flatMap((a) => a.modules);
		// The stored flags, read straight from the file: 17 of them differ from the defaults.
		expect(kept.filter((m, i) => m.mutaLock !== mods[i].mutaLock)).toHaveLength(17);
	});

	// Golden files: the old fixtures opened in the official editor v1.62 and saved (v23).
	const clean = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'paramaterDataOfs' ? undefined : v)));
	const parseAll = (bytes: Uint8Array<ArrayBuffer>) => {
		const p = new PatchParser(bytes.buffer);
		const perf = p.parsePrf2();
		return clean(perf ? { patches: perf.patches, global: perf.globalParamPages } : new PatchParser(bytes.buffer).parse());
	};
	for (const file of fs.readdirSync(path.join(FIXTURES, 'converted')).filter((f) => /\.(pch2|prf2)$/.test(f))) {
		it(`converts the old "${file}" to what the official editor saves`, () => {
			const old = readFixture(file);
			expect(old[old.indexOf(0) + 1]).toBeLessThan(23);
			expect(parseAll(old)).toEqual(parseAll(readFixture(path.join('converted', file))));
		});
		// The Bank Organizer writes such a file to the G2's memory as currentFormatFile re-writes it.
		it(`re-writes the old "${file}" as a current-format file equal to the official save`, () => {
			const golden = readFixture(path.join('converted', file));
			const file23 = new Uint8Array(currentFormatFile(readFixture(file))!.data);
			expect(file23[file23.indexOf(0) + 1]).toBe(23);
			expect(file23[file23.indexOf(0) + 2]).toBe(golden[golden.indexOf(0) + 2]); // patch/performance type byte
			expect(fileCrcOk(file23)).toBe(true);
			expect(parseAll(file23)).toEqual(parseAll(golden));
			expect(currentFormatFile(golden)).toBeNull();
			// Byte for byte too, except the low 6 bits of each 0x5a location byte (the official writer leaves
			// leftover buffer content there; we write 0) and so the CRC.
			const junk = new Set(
				sections(file23)
					.filter((x) => x.type === SectionType.MODULE_NAMES)
					.map((x) => x.ofs + 3),
			);
			const mask = (b: Uint8Array) => b.slice(0, -2).map((x, i) => (junk.has(i) ? x & 0xc0 : x));
			expect(mask(file23)).toEqual(mask(golden));
		});
	}
});

// Steps the golden files don't exercise, on hand-built slots.
describe('old file version conversion steps', () => {
	const mod = (type: number, index: number, modes: number[] = []) => ({ type, index, modes, pcnt: 0, lv: [] }) as unknown as ModuleInstance;
	const pp = (morphAssignments: PatchParamVariation['morphAssignments'] = []) =>
		({ morphDials: [0, 1, 2, 3, 4, 5, 6, 7], morphModes: [0, 0, 0, 0, 1, 0, 0, 0], morphAssignments }) as PatchParamVariation;
	const slot = (modules: ModuleInstance[], values: [number, number[][]][], cableList: Cable[] = [], patchParams = [pp()]): ConvertSlot => ({
		areas: [
			{ modules: [], cableList: [], values: new Map(), unknown: [] },
			{ modules, cableList, values: new Map(values), unknown: [] },
		],
		patchParams,
		knobs: [],
		controllers: [],
		globalKnobs: [],
	});

	it('FreqShift (v20): params 1 and 3 go, a 1 is appended, cables on removed jacks go and the rest renumber', () => {
		const cables: Cable[] = [
			{ colour: 0, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }, // output 0: removed
			{ colour: 0, smod: 1, scon: 2, dir: 1, dmod: 2, dcon: 1 }, // output 2 → 1
			{ colour: 0, smod: 2, scon: 0, dir: 1, dmod: 1, dcon: 2 }, // input 2: removed
			{ colour: 0, smod: 2, scon: 1, dir: 1, dmod: 1, dcon: 3 }, // input 3 → 2
		];
		const s = slot([mod(0x62, 1)], [[1, [[10, 11, 12, 13, 14]]]], cables);
		s.knobs.push(
			{ slotIndex: 0, location: 1, moduleIndex: 1, paramIndex: 4, isLed: 0 },
			{ slotIndex: 1, location: 1, moduleIndex: 1, paramIndex: 3, isLed: 0 },
		);
		expect(convertSlotToCurrent(s, 20)).toBe(true);
		expect(s.areas[1].values.get(1)).toEqual([[10, 12, 14, 1]]);
		expect(s.knobs).toEqual([{ slotIndex: 0, location: 1, moduleIndex: 1, paramIndex: 2, isLed: 0 }]);
		expect(cables.map((c) => [c.scon, c.dcon])).toEqual([
			[1, 1],
			[1, 2],
		]);
	});

	it('RndClkB/RandomB (v20): param removals, the Character mode is capped at 1', () => {
		const rndClk = mod(0xce, 1, [3]);
		const s = slot(
			[rndClk, mod(0xca, 2)],
			[
				[1, [[0, 1, 2, 3, 4, 5, 6]]],
				[2, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]],
			],
		);
		convertSlotToCurrent(s, 20);
		expect(s.areas[1].values.get(1)).toEqual([[0, 2, 3, 4, 6]]);
		expect(s.areas[1].values.get(2)).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 9]]);
		expect(rndClk.modes).toEqual([1]);
	});

	it('KeyQuant (v20): morph-only removals renumber the morphs above them, the values stay', () => {
		const morphs = [0, 1, 2, 3, 14].map((paramIndex) => ({ groupIndex: 0, location: 1 as const, moduleIndex: 1, paramIndex, range: 10 }));
		const s = slot([mod(0x98, 1)], [[1, [[0, 1, 2, 3]]]], [], [pp(morphs)]);
		convertSlotToCurrent(s, 20);
		// Removing 1, 2, … 13 in turn takes old 1 and 3; old 2 ends at 1, old 14 moves down until the
		// removals pass it (14 → 13 → 12 → … → 7).
		expect(s.patchParams[0].morphAssignments.map((m) => m.paramIndex)).toEqual([0, 1, 7]);
		expect(s.areas[1].values.get(1)).toEqual([[0, 1, 2, 3]]);
	});

	it('LfoC (v21): Rate rescaled when the waveform mode is 4 or 5; a morph that would vanish keeps ±1', () => {
		const morphs = [{ groupIndex: 2, location: 1 as const, moduleIndex: 1, paramIndex: 0, range: 5 }];
		const s = slot(
			[mod(0x18, 1, [4]), mod(0x18, 2, [0])],
			[
				[1, [[120, 0, 0, 1]]], // Range Lo: 120 → 127, morph end 125 → 127 too
				[2, [[50, 0, 0, 1]]], // waveform 0: untouched
			],
			[],
			[pp(morphs)],
		);
		convertSlotToCurrent(s, 21);
		expect(s.areas[1].values.get(1)![0][0]).toBe(127);
		expect(s.areas[1].values.get(2)![0][0]).toBe(50);
		expect(morphs[0].range).toBe(1);
	});

	it('drops the cables of a removed type-77 module (v21)', () => {
		const cables: Cable[] = [
			{ colour: 0, smod: 5, scon: 0, dir: 1, dmod: 2, dcon: 0 },
			{ colour: 0, smod: 2, scon: 0, dir: 1, dmod: 5, dcon: 1 },
			{ colour: 0, smod: 2, scon: 0, dir: 1, dmod: 3, dcon: 0 },
		];
		const s = slot([], [], cables);
		s.areas[1].unknown.push({ index: 5, type: 77 });
		convertSlotToCurrent(s, 21);
		expect(cables).toEqual([{ colour: 0, smod: 2, scon: 0, dir: 1, dmod: 3, dcon: 0 }]);
	});

	it('leaves a version older than 13 as it is', () => {
		const s = slot([mod(0x86, 1)], [[1, [[50]]]]);
		expect(convertSlotToCurrent(s, 12)).toBe(false);
		expect(s.areas[1].values.get(1)).toEqual([[50]]);
	});

	it('FltPhase/ModAmt (v13): params removed and added; the 13…19 removals leave global knobs alone', () => {
		const s = slot(
			[mod(0x66, 1), mod(0xc3, 2)],
			[
				[1, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]],
				[2, [[60, 0, 1]]], // ExpLin 1: not cubified by 15→16
			],
		);
		s.slot = 'A';
		s.globalKnobs.push({ slot: 'A', location: 1, moduleIndex: 1, paramIndex: 1, isLed: 0 } as never);
		s.knobs.push({ slotIndex: 0, location: 1, moduleIndex: 1, paramIndex: 1, isLed: 0 });
		convertSlotToCurrent(s, 13);
		// 13→14: 9, 1, 0 removed and three 0s added → [2 … 8, 10, 0, 0, 0]. 14→15 inverts Active (index 6):
		// 8 → 0. 15→16 cubifies index 7: T[10] = 5.
		expect(s.areas[1].values.get(1)).toEqual([[2, 3, 4, 5, 6, 7, 0, 5, 0, 0, 0]]);
		expect(s.areas[1].values.get(2)).toEqual([[60, 0, 1, 1]]);
		expect(s.knobs).toEqual([]);
		expect(s.globalKnobs).toHaveLength(1);
	});

	it('cubic scale (v15): a morph range may become 0; mixer levels only where ExpLin is not linear', () => {
		const morphs = [{ groupIndex: 0, location: 1 as const, moduleIndex: 1, paramIndex: 3, range: 1 }];
		const s = slot(
			[mod(0x61, 1), mod(0xc2, 2)],
			[
				[1, [[0, 0, 0, 2, 0, 0, 0]]], // OscA FreqFine… param 3 = 2
				[
					2,
					[
						[100, 0, 100, 0, 1], // Mix2-1A, ExpLin 1 (linear): left alone
						[100, 0, 100, 0, 0], // ExpLin 0: levels 0 and 2 cubified
					],
				],
			],
			[],
			[pp(morphs), pp()],
		);
		convertSlotToCurrent(s, 15);
		expect(s.areas[1].values.get(1)![0][3]).toBe(2);
		expect(morphs[0].range).toBe(0); // T[3] − T[2] = 0, kept as the official HandleCubifyParam does
		expect(s.areas[1].values.get(2)).toEqual([
			[100, 0, 100, 0, 1],
			[94, 0, 94, 0, 0], // T[100] = 94
		]);
	});

	it('v16: StChorus amount and its morphs halved, LFO Range capped, OscC waveform mode renumbered', () => {
		const morphs = [-3, 2].map((range, groupIndex) => ({ groupIndex, location: 1 as const, moduleIndex: 1, paramIndex: 0, range }));
		const oscC = mod(0x09, 3, [5]);
		const s = slot(
			[mod(0x5e, 1), mod(0x18, 2, [0]), oscC],
			[
				[1, [[9, 0, 1]]],
				[2, [[64, 0, 0, 5, 1]]],
				[3, [[64, 64, 1, 0, 0, 1, 0, 0]]],
			],
			[],
			[pp(morphs)],
		);
		convertSlotToCurrent(s, 16);
		expect(s.areas[1].values.get(1)![0][0]).toBe(5);
		expect(morphs.map((m) => m.range)).toEqual([-2, 1]);
		expect(s.areas[1].values.get(2)![0][3]).toBe(3);
		expect(oscC.modes).toEqual([2]);
	});

	it('v18: the Out Pad is capped at 1 with its morphs, DelayB TimeClk set to 0', () => {
		const morphs = [5, -4].map((range, groupIndex) => ({ groupIndex, location: 1 as const, moduleIndex: 1, paramIndex: 2, range }));
		const s = slot(
			[mod(0x04, 1), mod(0xb1, 2)],
			[
				[1, [[0, 1, 3]]],
				[2, [[10, 20, 30, 40, 1, 50]]],
			],
			[],
			[pp(morphs)],
		);
		convertSlotToCurrent(s, 18);
		expect(s.areas[1].values.get(1)).toEqual([[0, 1, 1]]);
		expect(morphs.map((m) => m.range)).toEqual([1, -1]);
		expect(s.areas[1].values.get(2)![0][4]).toBe(0);
	});
});
