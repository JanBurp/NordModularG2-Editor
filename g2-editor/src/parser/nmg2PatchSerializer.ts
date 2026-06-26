import type { Patch, ModuleInstance, Cable, PatchDescription, PatchParamVariation, VariationState, MidiCCAssignment } from '@/types';
import { SectionType } from './constants';

// CRC-16 lookup table (same polynomial as parser)
const crctab = [
	0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210, 0x3273,
	0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6, 0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7,
	0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d, 0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b,
	0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823, 0xc9cc, 0xd9ed, 0xe98e, 0xf9af,
	0x8948, 0x9969, 0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b,
	0xab1a, 0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6,
	0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70, 0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c,
	0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067, 0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
	0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d, 0x34e2, 0x24c3, 0x14a0,
	0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676,
	0x4615, 0x5634, 0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d,
	0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a, 0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
	0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1, 0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9,
	0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
];

function calcCrc(data: Uint8Array): number {
	let rv = 0;
	for (let i = 0; i < data.length; i++) rv = (crctab[((rv >> 8) ^ data[i]) & 0xff] ^ (rv << 8)) & 0xffff;
	return rv;
}

function hexToBytes(hex: string): Uint8Array {
	const matches = hex.match(/.{2}/g)!;
	return new Uint8Array(matches.map((b) => parseInt(b, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// Accumulates bits MSB-first, same logic as setBits in the parser
class BitWriter {
	private bits: number[] = [];

	write(numbits: number, value: number): void {
		for (let bw = 1 << (numbits - 1); bw >= 1; bw >>= 1) this.bits.push(value & bw ? 1 : 0);
	}

	flush(): Uint8Array {
		const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
		for (let i = 0; i < this.bits.length; i++) {
			if (this.bits[i]) bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
		}
		this.bits = [];
		return bytes;
	}
}

function makeSection(type: number, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(3 + data.length);
	out[0] = type;
	// Size is big-endian int16 (matches DataView.getInt16 default in parser)
	out[1] = (data.length >> 8) & 0xff;
	out[2] = data.length & 0xff;
	out.set(data, 3);
	return out;
}

function writeModuleList(areaIdx: 0 | 1, modules: ModuleInstance[]): Uint8Array {
	const bw = new BitWriter();
	bw.write(2, areaIdx);
	bw.write(8, modules.length);
	for (const m of modules) {
		bw.write(8, m.type);
		bw.write(8, m.index);
		bw.write(7, m.horiz);
		bw.write(7, m.vert);
		bw.write(8, m.colour);
		bw.write(1, m.uprate);
		bw.write(1, m.leds);
		bw.write(6, 0); // 6 padding bits (parser discards these)
		const nmodes = m.modes?.length ?? 0;
		bw.write(4, nmodes);
		for (const mode of m.modes ?? []) bw.write(6, mode);
	}
	return makeSection(SectionType.MODULE_LIST, bw.flush());
}

function writeCableList(areaIdx: 0 | 1, cables: Cable[]): Uint8Array {
	const bw = new BitWriter();
	bw.write(2, areaIdx);
	bw.write(6, 0); // 6 padding bits
	bw.write(16, cables.length);
	for (const c of cables) {
		bw.write(3, c.colour);
		bw.write(8, c.smod);
		bw.write(6, c.scon);
		bw.write(1, c.dir ?? 1);
		bw.write(8, c.dmod);
		bw.write(6, c.dcon);
	}
	return makeSection(SectionType.CABLE_LIST, bw.flush());
}

function writeParameters(areaIdx: 0 | 1, modules: ModuleInstance[], variations: VariationState[]): Uint8Array {
	const withParams = modules.filter((m) => m.pcnt > 0);
	const aKey = areaIdx === 0 ? 'fx' : 'voice';
	const bw = new BitWriter();
	bw.write(2, areaIdx);
	bw.write(8, withParams.length);
	bw.write(8, withParams.length > 0 ? 9 : 0);
	for (const m of withParams) {
		bw.write(8, m.index);
		bw.write(7, m.pcnt);
		for (let v = 0; v < 9; v++) {
			bw.write(8, v);
			for (let p = 0; p < m.pcnt; p++) bw.write(7, variations[v]?.[aKey]?.[m.index]?.[p] ?? 0);
		}
	}
	return makeSection(SectionType.PARAMETERS, bw.flush());
}

function writeParamNames(areaIdx: 0 | 1, modules: ModuleInstance[]): Uint8Array | null {
	const labeled = modules.filter((m) => m.paramLabels && m.paramLabels.length > 0);
	if (labeled.length === 0) return null;

	const bw = new BitWriter();
	bw.write(2, areaIdx);
	bw.write(8, labeled.length);
	for (const m of labeled) {
		bw.write(8, m.index);
		const moduleLen = m.paramLabels!.reduce((sum, e) => sum + 3 + e.labels.length * 7, 0);
		bw.write(8, moduleLen);
		for (const entry of m.paramLabels!) {
			bw.write(8, entry.isString ? 1 : 0);
			bw.write(8, 1 + entry.labels.length * 7);
			bw.write(8, entry.paramIndex);
			for (const label of entry.labels) {
				for (let i = 0; i < 7; i++) bw.write(8, i < label.length ? label.charCodeAt(i) : 0);
			}
		}
	}
	return makeSection(SectionType.PARAM_NAMES, bw.flush());
}

function writeModuleNames(areaIdx: 0 | 1, modules: ModuleInstance[]): Uint8Array | null {
	const named = modules.filter((m) => m.uname && m.uname.length > 0);
	if (named.length === 0) return null;

	let size = 2; // 1 byte header (areaIdx), 1 byte count
	for (const m of named) {
		const nameLen = Math.min(m.uname!.length, 16);
		size += 1 + nameLen + (nameLen < 16 ? 1 : 0); // index + name + optional null
	}

	const data = new Uint8Array(size);
	data[0] = (areaIdx << 6) & 0xff; // top 2 bits = areaIdx, matches parser getBits(2, data, 2)
	data[1] = named.length;
	let ofs = 2;
	for (const m of named) {
		const nameLen = Math.min(m.uname!.length, 16);
		data[ofs] = m.index;
		for (let i = 0; i < nameLen; i++) data[ofs + 1 + i] = m.uname!.charCodeAt(i);
		if (nameLen < 16) data[ofs + 1 + nameLen] = 0;
		ofs += 1 + nameLen + (nameLen < 16 ? 1 : 0);
	}

	return makeSection(SectionType.MODULE_NAMES, data);
}

function writePatchParamSection(params: PatchParamVariation[]): Uint8Array {
	const NUM_VAR = 9;
	const bw = new BitWriter();
	bw.write(2, 2); // areaIdx = 2
	bw.write(8, 7); // 7 sub-sections
	bw.write(8, NUM_VAR);
	// Sub 1: Morphs
	bw.write(8, 1);
	bw.write(7, 16);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		for (let j = 0; j < 8; j++) bw.write(7, params[v]?.morphDials?.[j] ?? 0);
		for (let j = 0; j < 8; j++) bw.write(7, params[v]?.morphModes?.[j] ?? 0);
	}
	// Sub 2: Volume
	bw.write(8, 2);
	bw.write(7, 2);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		bw.write(7, params[v]?.patchVol ?? 0);
		bw.write(7, params[v]?.activeMuted ?? 0);
	}
	// Sub 3: Glide
	bw.write(8, 3);
	bw.write(7, 2);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		bw.write(7, params[v]?.glide ?? 0);
		bw.write(7, params[v]?.glideTime ?? 0);
	}
	// Sub 4: Bend
	bw.write(8, 4);
	bw.write(7, 2);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		bw.write(7, params[v]?.bend ?? 0);
		bw.write(7, params[v]?.semi ?? 0);
	}
	// Sub 5: Vibrato
	bw.write(8, 5);
	bw.write(7, 3);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		bw.write(7, params[v]?.vibrato ?? 0);
		bw.write(7, params[v]?.cents ?? 0);
		bw.write(7, params[v]?.rate ?? 0);
	}
	// Sub 6: Arp
	bw.write(8, 6);
	bw.write(7, 4);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		bw.write(7, params[v]?.arpeggiator ?? 0);
		bw.write(7, params[v]?.arpTime ?? 0);
		bw.write(7, params[v]?.arpType ?? 0);
		bw.write(7, params[v]?.octaves ?? 0);
	}
	// Sub 7: OctaveShift + Sustain
	bw.write(8, 7);
	bw.write(7, 2);
	for (let v = 0; v < NUM_VAR; v++) {
		bw.write(8, v);
		bw.write(7, params[v]?.octaveShift ?? 0);
		bw.write(7, params[v]?.sustain ?? 0);
	}
	return makeSection(SectionType.PARAMETERS, bw.flush());
}

export function buildPatchDescriptionBytes(templateRawHex: string, desc: PatchDescription): Uint8Array | null {
	const template = hexToBytes(templateRawHex);
	const sectionDataLen = template.length - 2;
	let ofs = 0;
	while (ofs < sectionDataLen) {
		const type = template[ofs];
		const siz = (template[ofs + 1] << 8) | template[ofs + 2];
		const secData = template.slice(ofs + 3, ofs + 3 + siz);
		if (type === SectionType.PATCH_DESC) {
			const encoded = writePatchDescription(secData, desc);
			// G2 expects exactly the original section length (15 bytes); pad with zeros if needed
			if (encoded.length < secData.length) {
				const padded = new Uint8Array(secData.length);
				padded.set(encoded);
				return padded;
			}
			return encoded;
		}
		ofs += 3 + siz;
	}
	return null;
}

function writePatchDescription(secData: Uint8Array, desc: PatchDescription): Uint8Array {
	const bw = new BitWriter();
	// Preserve the first 61 bits (unknown header, not stored during parsing)
	for (let b = 0; b < 61; b++) {
		const bitMask = 1 << (7 - (b % 8));
		bw.write(1, secData[Math.floor(b / 8)] & bitMask ? 1 : 0);
	}
	bw.write(5, desc.voices);
	bw.write(14, desc.height);
	bw.write(3, desc.octaveShift);
	bw.write(1, desc.red);
	bw.write(1, desc.blue);
	bw.write(1, desc.yellow);
	bw.write(1, desc.orange);
	bw.write(1, desc.green);
	bw.write(1, desc.purple);
	bw.write(1, desc.white);
	bw.write(2, desc.monopoly);
	bw.write(8, desc.variation);
	bw.write(8, desc.category);
	const result = bw.flush();
	if (result.length >= secData.length) return result;
	const padded = new Uint8Array(secData.length);
	padded.set(result);
	return padded;
}

// Concatenates sections, computes CRC, returns rawHex string.
function buildRawHex(sections: Uint8Array[]): string {
	const totalLen = sections.reduce((s, b) => s + b.length, 0);
	const sectionBytes = new Uint8Array(totalLen);
	let writeOfs = 0;
	for (const sec of sections) {
		sectionBytes.set(sec, writeOfs);
		writeOfs += sec.length;
	}
	// CRC covers [0x17][0x00][sectionBytes] (same range as parser's filedataArray)
	const forCrc = new Uint8Array(2 + sectionBytes.length);
	forCrc[0] = 0x17;
	forCrc[1] = 0x00;
	forCrc.set(sectionBytes, 2);
	const crc = calcCrc(forCrc);
	const result = new Uint8Array(sectionBytes.length + 2);
	result.set(sectionBytes);
	result[sectionBytes.length] = (crc >> 8) & 0xff;
	result[sectionBytes.length + 1] = crc & 0xff;
	return bytesToHex(result);
}

function writeControllers(controllers: MidiCCAssignment[]): Uint8Array {
	const bw = new BitWriter();
	bw.write(7, controllers.length);
	for (const c of controllers) {
		bw.write(7, c.cc);
		bw.write(2, c.location);
		bw.write(8, c.moduleIndex);
		bw.write(7, c.paramIndex);
	}
	return makeSection(SectionType.CONTROLLERS, bw.flush());
}

// Tracks which area sections have already been written (prevents duplicates within one slot).
interface WrittenSets {
	m4a: Set<number>;
	m52: Set<number>;
	m4d: Set<number>;
	m5a: Set<number>;
	m5b: Set<number>;
	m60: boolean;
}

function newWrittenSets(): WrittenSets {
	return { m4a: new Set(), m52: new Set(), m4d: new Set(), m5a: new Set(), m5b: new Set(), m60: false };
}

/**
 * Processes one section from the template, appending the regenerated (or verbatim)
 * output to `out`. Mutates `w` to track what has been written.
 *
 * mutable sections (module list, cable list, parameters, names) are regenerated
 * from `patch`; all other sections are preserved verbatim from the template.
 */
function processSection(
	type: number,
	siz: number,
	secData: Uint8Array,
	verbatim: Uint8Array,
	patch: Patch,
	out: Uint8Array[],
	w: WrittenSets,
	variations: VariationState[],
): void {
	const areaIdx = siz > 0 ? (secData[0] >> 6) & 0x3 : 0;

	if (type === SectionType.PARAMETERS && areaIdx === 2 && !w.m4d.has(2)) {
		if (variations.length) {
			out.push(writePatchParamSection(variations.map((v) => v.patch)));
		} else {
			out.push(verbatim);
		}
		w.m4d.add(2);
	} else if (type === SectionType.MODULE_LIST && areaIdx <= 1 && !w.m4a.has(areaIdx)) {
		out.push(writeModuleList(areaIdx as 0 | 1, patch.areas[areaIdx].modules));
		w.m4a.add(areaIdx);
	} else if (type === SectionType.CABLE_LIST && areaIdx <= 1 && !w.m52.has(areaIdx)) {
		out.push(writeCableList(areaIdx as 0 | 1, patch.areas[areaIdx].cableList ?? []));
		w.m52.add(areaIdx);
	} else if (type === SectionType.PARAMETERS && areaIdx <= 1 && !w.m4d.has(areaIdx)) {
		out.push(writeParameters(areaIdx as 0 | 1, patch.areas[areaIdx].modules, variations));
		w.m4d.add(areaIdx);
		// Param names follow params in Delphi write order; emit here so
		// labels survive even if the template predates them.
		const paramNamesSection = writeParamNames(areaIdx as 0 | 1, patch.areas[areaIdx].modules);
		if (paramNamesSection) out.push(paramNamesSection);
		w.m5b.add(areaIdx);
	} else if (type === SectionType.PARAM_NAMES && areaIdx <= 1) {
		if (!w.m5b.has(areaIdx)) {
			const sec = writeParamNames(areaIdx as 0 | 1, patch.areas[areaIdx].modules);
			if (sec) out.push(sec);
			w.m5b.add(areaIdx);
		}
		// If already written via PARAMETERS trigger, skip (don't preserve verbatim)
	} else if (type === SectionType.MODULE_NAMES && areaIdx <= 1 && !w.m5a.has(areaIdx)) {
		const namesSection = writeModuleNames(areaIdx as 0 | 1, patch.areas[areaIdx].modules);
		if (namesSection) out.push(namesSection);
		w.m5a.add(areaIdx);
	} else if (type === SectionType.PATCH_DESC) {
		const newData = patch.description ? writePatchDescription(secData, patch.description) : secData;
		out.push(makeSection(SectionType.PATCH_DESC, newData));
	} else if (type === SectionType.CONTROLLERS && !w.m60) {
		const controllers = patch.controllers ?? [];
		if (controllers.length > 0) out.push(writeControllers(controllers));
		w.m60 = true;
	} else {
		// Preserve verbatim: text pad (SEPARATOR), perf data (PERF_DATA), unknown sections
		out.push(verbatim);
	}
}

/**
 * Re-serializes a Patch to rawHex using section-replacement:
 * mutable sections (module list, cable list, parameters, names) are regenerated
 * from the patch object; all other sections (description, text pad) are preserved
 * verbatim from the template.
 *
 * templateRawHex must be the last valid rawHex from the hardware or file load —
 * it is used to copy preserved sections (especially the patch description whose
 * first 61 bits are discarded during parsing and cannot be reconstructed).
 */
export function serializePatch(name: string, patch: Patch, templateRawHex: string, variations: VariationState[]): string {
	const template = hexToBytes(templateRawHex);
	const sectionDataLen = template.length - 2; // exclude trailing CRC bytes
	const out: Uint8Array[] = [];
	const w = newWrittenSets();
	let ofs = 0;
	while (ofs < sectionDataLen) {
		const type = template[ofs];
		const siz = (template[ofs + 1] << 8) | template[ofs + 2];
		const secData = template.slice(ofs + 3, ofs + 3 + siz);
		processSection(type, siz, secData, template.slice(ofs, ofs + 3 + siz), patch, out, w, variations);
		ofs += 3 + siz;
	}
	if (!w.m60 && patch.controllers && patch.controllers.length > 0) {
		out.push(writeControllers(patch.controllers));
	}
	return buildRawHex(out);
}

/**
 * Re-serializes a prf2 Performance to rawHex using the same section-replacement strategy
 * as serializePatch, but slot-aware: written sets reset at each SEPARATOR boundary so all 4
 * slots' sections are updated, not just slot 0's.
 */
export function serializePerformance(patches: Patch[], templateRawHex: string, variationsArray: VariationState[][]): string {
	const template = hexToBytes(templateRawHex);
	const sectionDataLen = template.length - 2;
	const out: Uint8Array[] = [];
	let slotIdx = 0;
	let w = newWrittenSets();
	let ofs = 0;
	while (ofs < sectionDataLen) {
		const type = template[ofs];
		const siz = (template[ofs + 1] << 8) | template[ofs + 2];
		const secData = template.slice(ofs + 3, ofs + 3 + siz);
		if (type === SectionType.SEPARATOR) {
			const patch = patches[slotIdx] ?? patches[0];
			if (!w.m60 && patch.controllers && patch.controllers.length > 0) {
				out.push(writeControllers(patch.controllers));
			}
			out.push(template.slice(ofs, ofs + 3 + siz));
			// Advance to next slot when more data follows
			if (ofs + 3 + siz < sectionDataLen) {
				slotIdx++;
				w = newWrittenSets();
			}
		} else {
			processSection(type, siz, secData, template.slice(ofs, ofs + 3 + siz), patches[slotIdx] ?? patches[0], out, w, variationsArray[slotIdx] ?? []);
		}
		ofs += 3 + siz;
	}
	const lastPatch = patches[slotIdx] ?? patches[0];
	if (!w.m60 && lastPatch?.controllers && lastPatch.controllers.length > 0) {
		out.push(writeControllers(lastPatch.controllers));
	}
	return buildRawHex(out);
}
