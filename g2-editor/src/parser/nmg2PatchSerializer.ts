import type { Patch, ModuleInstance, Cable, PatchDescription } from '@/types';

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
		for (let bw = Math.pow(2, numbits - 1); bw >= 1; bw >>= 1) this.bits.push(value & bw ? 1 : 0);
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
	return makeSection(0x4a, bw.flush());
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
		bw.write(1, c.dir);
		bw.write(8, c.dmod);
		bw.write(6, c.dcon);
	}
	return makeSection(0x52, bw.flush());
}

function writeParameters(areaIdx: 0 | 1, modules: ModuleInstance[]): Uint8Array {
	const withParams = modules.filter((m) => m.pcnt > 0);
	const bw = new BitWriter();
	bw.write(2, areaIdx);
	bw.write(8, withParams.length);
	bw.write(8, withParams.length > 0 ? 9 : 0);
	for (const m of withParams) {
		bw.write(8, m.index);
		bw.write(7, m.pcnt);
		for (let v = 0; v < 9; v++) {
			bw.write(8, v);
			for (let p = 0; p < m.pcnt; p++) bw.write(7, m.lv[v * m.pcnt + p] ?? 0);
		}
	}
	return makeSection(0x4d, bw.flush());
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
	return makeSection(0x5b, bw.flush());
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

	return makeSection(0x5a, data);
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
	bw.write(3, desc.unk2);
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
	return bw.flush();
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
export function serializePatch(name: string, patch: Patch, templateRawHex: string): string {
	const template = hexToBytes(templateRawHex);
	const sectionDataLen = template.length - 2; // exclude trailing CRC bytes

	const outSections: Uint8Array[] = [];

	// Track which areas have had their sections written (to handle duplicates gracefully)
	const written4a = new Set<number>();
	const written52 = new Set<number>();
	const written4d = new Set<number>();
	const written5a = new Set<number>();
	const written5b = new Set<number>();

	let ofs = 0;
	while (ofs < sectionDataLen) {
		const type = template[ofs];
		const siz = (template[ofs + 1] << 8) | template[ofs + 2];
		const secData = template.slice(ofs + 3, ofs + 3 + siz);
		// Area index is always the top 2 bits of the first byte of section data
		const areaIdx = siz > 0 ? (secData[0] >> 6) & 0x3 : 0;

		if (type === 0x4a && areaIdx <= 1 && !written4a.has(areaIdx)) {
			outSections.push(writeModuleList(areaIdx as 0 | 1, patch.areas[areaIdx].modules));
			written4a.add(areaIdx);
		} else if (type === 0x52 && areaIdx <= 1 && !written52.has(areaIdx)) {
			outSections.push(writeCableList(areaIdx as 0 | 1, patch.areas[areaIdx].cableList ?? []));
			written52.add(areaIdx);
		} else if (type === 0x4d && areaIdx <= 1 && !written4d.has(areaIdx)) {
			outSections.push(writeParameters(areaIdx as 0 | 1, patch.areas[areaIdx].modules));
			written4d.add(areaIdx);
			// Param names follow params in Delphi write order; emit here so
			// labels survive even if the template predates them.
			const paramNamesSection = writeParamNames(areaIdx as 0 | 1, patch.areas[areaIdx].modules);
			if (paramNamesSection) outSections.push(paramNamesSection);
			written5b.add(areaIdx);
		} else if (type === 0x5b && areaIdx <= 1 && !written5b.has(areaIdx)) {
			const paramNamesSection = writeParamNames(areaIdx as 0 | 1, patch.areas[areaIdx].modules);
			if (paramNamesSection) outSections.push(paramNamesSection);
			written5b.add(areaIdx);
		} else if (type === 0x5b && areaIdx <= 1 && written5b.has(areaIdx)) {
			// Already emitted via 0x4d trigger; skip the template's 0x5b.
		} else if (type === 0x5a && areaIdx <= 1 && !written5a.has(areaIdx)) {
			const namesSection = writeModuleNames(areaIdx as 0 | 1, patch.areas[areaIdx].modules);
			// Only emit if there are named modules; if none, omit the section entirely
			if (namesSection) outSections.push(namesSection);
			written5a.add(areaIdx);
		} else if (type === 0x21) {
			const newData = patch.description ? writePatchDescription(secData, patch.description) : secData;
			outSections.push(makeSection(0x21, newData));
		} else {
			// Preserve verbatim: text pad (0x6f), perf data (0x11), etc.
			outSections.push(template.slice(ofs, ofs + 3 + siz));
		}

		ofs += 3 + siz;
	}

	// Concatenate all sections
	const totalLen = outSections.reduce((s, b) => s + b.length, 0);
	const sectionBytes = new Uint8Array(totalLen);
	let writeOfs = 0;
	for (const sec of outSections) {
		sectionBytes.set(sec, writeOfs);
		writeOfs += sec.length;
	}

	// CRC covers [0x17][0x00][sectionBytes] (same range as parser's filedataArray)
	const forCrc = new Uint8Array(2 + sectionBytes.length);
	forCrc[0] = 0x17;
	forCrc[1] = 0x00;
	forCrc.set(sectionBytes, 2);
	const crc = calcCrc(forCrc);

	// rawHex = sectionBytes + 2-byte CRC
	const result = new Uint8Array(sectionBytes.length + 2);
	result.set(sectionBytes);
	result[sectionBytes.length] = (crc >> 8) & 0xff;
	result[sectionBytes.length + 1] = crc & 0xff;

	return bytesToHex(result);
}
