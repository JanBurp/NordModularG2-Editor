/**
 * Clavia Nord Modular G2 pch2 file reader writer
 * Adapted from g2ools python utility at https://github.com/msg/g2-tools
 *
 * prf2 file is very similar but contains extra section type 0x11 at beginning which contains slot names and slot data
 */

import type { Area, Cable, Patch, PatchDescription, PatchParamVariation } from '../types/patch';
import type { ModuleInstance, ParamLabel } from '../types/module';

import { getModule } from '../renderer/nmg2mods';
import { SectionType } from './constants';

export type { ModuleInstance, ParamLabel, Area, Cable, Patch, PatchDescription, PatchParamVariation };

class G2Area implements Area {
	name: string;
	modules: ModuleInstance[] = [];
	cableList: Cable[] = [];
	paramaterDataOfs = 0;
	nummod?: number;
	numcab?: number;
	[key: string]: unknown;

	constructor(name: string) {
		this.name = name;
	}
}

class G2Parser {
	private areas: G2Area[] = [new G2Area('fx'), new G2Area('voice')];
	private slots: string[] = [];
	private aof = 0;
	private textpadofs = 0;
	private textpadlen = 0;
	private rawData: Uint8Array = new Uint8Array(0);
	private bitofs = 0;
	private bitbuf: number[] = [];
	private patchParamsData: PatchParamVariation[][] = [];
	private pd: (PatchDescription | null)[] = [];
	readonly data: ArrayBuffer;
	ofs = 0;

	constructor(data: ArrayBuffer) {
		this.data = data;

		const g2section: Record<number, [string, (data: Uint8Array) => string | undefined | void]> = {
			[SectionType.PATCH_DESC]: ['Patch Description', (d) => this.parsePatchDesc(d)],
			[SectionType.MODULE_NAMES]: ['Module Names', (d) => this.parseModuleNames(d)],
			[SectionType.MODULE_LIST]: ['Module List', (d) => this.parseModuleList(d)],
			[SectionType.SEPARATOR]: ['Text Pad', (d) => this.parseTextPad(d)],
			[SectionType.PERF_DATA]: ['Perf data', (d) => this.parsePrfData(d)],
			[SectionType.CABLE_LIST]: ['Cable List', (d) => this.parseCableList(d)],
			[SectionType.PARAMETERS]: ['Parameters', (d) => this.parseModuleParameters(d)],
			[SectionType.PARAM_NAMES]: ['Param Names', (d) => this.parseParamNames(d)],
		};

		const hdr = new Uint8Array(data, 0, 320);
		const str = String.fromCharCode.apply(null, hdr as unknown as number[]);
		let ofs = str.indexOf('\0');
		const textHdrLen = ofs + 3;
		const fileCRC = new DataView(data).getInt16(data.byteLength - 2) & 0xffff;
		const filedata = new DataView(data, ofs + 3, data.byteLength - ofs - 5);
		this.ofs = ofs;
		const filedataArray = new Uint8Array(data, ofs + 1, data.byteLength - ofs - 3);
		if (fileCRC !== calcCrc(filedataArray)) {
			console.warn('PCH2 WARNING: CRC mismatch');
		}

		const maxofs = filedata.byteLength;
		ofs = 0;
		while (ofs < maxofs) {
			const type = filedata.getInt8(ofs);
			const siz = filedata.getInt16(ofs + 1);
			if (type in g2section) {
				g2section[type][1]?.(new Uint8Array(data, textHdrLen + ofs + 3, siz));
			}
			ofs += siz + 3;
			if (type == SectionType.SEPARATOR) {
				if (ofs < maxofs) {
					this.areas.push(new G2Area('fx'));
					this.areas.push(new G2Area('voice'));
					this.aof += 2;
				}
			}
		}
	}

	getAllModules(areaIdx: number): ModuleInstance[] {
		return this.areas[areaIdx].modules;
	}

	getAllCables(areaIdx: number): Cable[] {
		return this.areas[areaIdx].cableList;
	}

	getTextPad(): string | null {
		if (this.textpadlen == 0) return null;
		let rv = '';
		const dv = new DataView(this.data);
		for (let i = 0; i < this.textpadlen; i++) rv += String.fromCharCode(dv.getUint8(this.textpadofs + i));
		return rv;
	}

	setTextPad(str: string): void {
		if (this.textpadlen == 0) return;
		const dv = new DataView(this.data);
		for (let i = 0; i < Math.min(str.length, this.textpadlen); i++) dv.setUint8(this.textpadofs + i, str.charCodeAt(i));
	}

	getArea(areaIndex: number): G2Area {
		return this.areas[areaIndex];
	}

	getUrl(): string {
		const blob = new Blob([this.data], { type: 'application/octet-binary' });
		return URL.createObjectURL(blob);
	}

	isPrf2(): string[] {
		return this.slots;
	}

	getpd(slot: number): PatchDescription | null {
		return this.pd[slot] ?? null;
	}

	getPatchParams(slot: number): PatchParamVariation[] | null {
		return this.patchParamsData[slot] ?? null;
	}

	writeParameters(areanum: number): void {
		const area = this.areas[areanum];
		this.setBits(2, areanum);
		this.setBits(8, area.nummod || 0);
		this.setBits(8, area.nummod ? 9 : 0);
		for (let i = 0; i < area.modules.length; i++) {
			const m = area.modules[i];
			if (m.pcnt == 0) continue;
			this.setBits(8, m.index);
			this.setBits(7, m.pcnt);
			for (let v = 0; v < 9; v++) {
				this.setBits(8, v);
				for (let p = 0; p < m.pcnt; p++) this.setBits(7, m.lv[v * m.pcnt + p]);
			}
		}
		const dataArray = new Int8Array(this.data);
		dataArray.set(this.setBits(0)!, area.paramaterDataOfs);
		const ofs = this.ofs;
		const filedataArray = new Uint8Array(this.data, ofs + 1, this.data.byteLength - ofs - 3);
		const calcCRC = calcCrc(filedataArray);
		dataArray.set([Math.floor(calcCRC / 256), calcCRC % 256], this.data.byteLength - 2);
	}

	getModuleArray(areaIdx: number, basename: string): ModuleInstance[] {
		const array: ModuleInstance[] = [];
		let i = 0;
		let m: ModuleInstance | null;
		while ((m = this.getModuleByName(areaIdx, basename + i))) {
			i += 1;
			array.push(m);
		}
		return array;
	}

	private getBits(numbits: number, initialData?: Uint8Array): number {
		if (initialData) {
			this.rawData = initialData;
			this.bitofs = 0;
		}
		let rv = (this.rawData[this.bitofs >> 3] >> (7 - (this.bitofs & 7))) & 1;
		this.bitofs++;
		while (numbits > 1) {
			rv = (rv << 1) | ((this.rawData[this.bitofs >> 3] >> (7 - (this.bitofs & 7))) & 1);
			this.bitofs++;
			numbits--;
		}
		return rv;
	}

	private setBits(numbits: number, byte?: number): Int8Array | undefined {
		if (numbits) {
			for (let bw = 1 << (numbits - 1); bw; bw >>= 1) this.bitbuf.push((byte ?? 0) & bw ? 1 : 0);
		} else {
			const bytes = new Int8Array(Math.ceil(this.bitbuf.length / 8));
			for (let i = 0; i < this.bitbuf.length; i++) {
				const bofs = Math.floor(i / 8);
				if (this.bitbuf[i]) bytes[bofs] |= Math.pow(2, 7 - (i % 8));
			}
			this.bitbuf = [];
			return bytes;
		}
	}

	private findModule(areaIdx: number, index: number): ModuleInstance | null {
		for (let i = 0; i < this.areas[areaIdx].modules.length; i++) {
			if (this.areas[areaIdx].modules[i].index == index) return this.areas[areaIdx].modules[i];
		}
		return null;
	}

	private setModuleName(areaIdx: number, index: number, name: string): void {
		this.findModule(this.aof + areaIdx, index)!.uname = name;
	}

	private parseModuleNames(data: Uint8Array): string {
		const areaIdx = this.getBits(2, data);
		this.getBits(6);
		const nummod = this.getBits(8);
		let ofs = 2;
		for (let i = 0; i < nummod; i++) {
			const index = data[ofs];
			let str = '';
			let charcode: number | undefined;
			let j: number;
			for (j = 1; j < 17; j++) {
				if ((charcode = data[ofs + j])) str += String.fromCharCode(charcode);
				else break;
			}
			ofs += j + 1;
			if (charcode) ofs--;
			this.setModuleName(areaIdx, index, str);
		}
		return 'Area=' + areaIdx + ':Count=' + nummod;
	}

	private parseParamNames(data: Uint8Array): string {
		const areaIdx = this.getBits(2, data);
		const nummod = this.getBits(8);
		if (areaIdx > 1) return 'Area=' + areaIdx;
		for (let i = 0; i < nummod; i++) {
			const modIdx = this.getBits(8);
			const moduleLen = this.getBits(8);
			const entries: ParamLabel[] = [];
			let bytesRemaining = moduleLen;
			while (bytesRemaining > 0) {
				const isString = this.getBits(8);
				const paramLen = this.getBits(8);
				const paramIndex = this.getBits(8);
				bytesRemaining -= 3;
				const entry: ParamLabel = {
					paramIndex,
					isString: isString === 1,
					paramLen,
					labels: [],
				};
				if (paramLen - 1 > 0) {
					const labelCount = Math.floor((paramLen - 1) / 7);
					for (let j = 0; j < labelCount; j++) {
						let str = '';
						for (let k = 0; k < 7; k++) {
							const c = this.getBits(8);
							if (c) str += String.fromCharCode(c);
						}
						entry.labels.push(str);
						bytesRemaining -= 7;
					}
				}
				entries.push(entry);
			}
			if (entries.length > 0) {
				const m = this.findModule(this.aof + areaIdx, modIdx);
				if (m) m.paramLabels = entries;
			}
		}
		return 'Area=' + areaIdx + ':Count=' + nummod;
	}

	private parseModuleList(data: Uint8Array): string {
		const areaIdx = this.getBits(2, data);
		const nummod = this.getBits(8);
		for (let i = 0; i < nummod; i++) {
			const modtype = this.getBits(8);
			const modDef = getModule(modtype);
			if (!modDef) {
				console.error(`Module type ${modtype} not found in module definitions`);
				continue;
			}
			const mod: ModuleInstance = Object.create(modDef) as ModuleInstance;
			mod.pcnt = modDef.params?.length || 0;
			mod.lv = Array(mod.pcnt * 9);
			mod.index = this.getBits(8);
			mod.type = modtype;
			mod.horiz = this.getBits(7);
			mod.vert = this.getBits(7);
			mod.colour = this.getBits(8);
			mod.uprate = this.getBits(1);
			mod.leds = this.getBits(1);
			this.getBits(6);
			const nmodes = this.getBits(4);
			mod.modes = [];
			for (let j = 0; j < nmodes; j++) mod.modes.push(this.getBits(6));
			this.areas[this.aof + areaIdx].modules.push(mod);
		}
		return 'Area=' + areaIdx + ':Count=' + nummod;
	}

	private parseTextPad(data: Uint8Array): void {
		this.textpadlen = data.length;
		this.textpadofs = data.byteOffset;
	}

	private parseModuleParameters(data: Uint8Array): string {
		const areaIdx = this.getBits(2, data);
		const nummod = this.getBits(8);
		const numvar = this.getBits(8);
		if (areaIdx === 2) {
			const varCount = numvar;
			const slotIdx = this.aof >> 1;
			const params: PatchParamVariation[] = [];
			const vp = (v: number): PatchParamVariation => {
				if (!params[v]) params[v] = { patchVol: 0, activeMuted: 0, glide: 0, glideTime: 0, bend: 0, semi: 0, vibrato: 0, cents: 0, rate: 0, arpeggiator: 0, arpTime: 0, arpType: 0, octaveShift: 0, sustain: 0, octaves: 0 };
				return params[v];
			};
			// Section 1: Morphs — consume bits, don't store
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				this.getBits(8); // variation
				for (let j = 0; j < 16; j++) this.getBits(7); // 8 dials + 8 modes
			}
			// Section 2: Volume
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) { const v = this.getBits(8); vp(v).patchVol = this.getBits(7); vp(v).activeMuted = this.getBits(7); }
			// Section 3: Glide
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) { const v = this.getBits(8); vp(v).glide = this.getBits(7); vp(v).glideTime = this.getBits(7); }
			// Section 4: Bend
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) { const v = this.getBits(8); vp(v).bend = this.getBits(7); vp(v).semi = this.getBits(7); }
			// Section 5: Vibrato
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) { const v = this.getBits(8); vp(v).vibrato = this.getBits(7); vp(v).cents = this.getBits(7); vp(v).rate = this.getBits(7); }
			// Section 6: Arp
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) { const v = this.getBits(8); vp(v).arpeggiator = this.getBits(7); vp(v).arpTime = this.getBits(7); vp(v).arpType = this.getBits(7); vp(v).octaves = this.getBits(7); }
			// Section 7: Octave shift
			this.getBits(8); this.getBits(7);
			for (let i = 0; i < varCount; i++) { const v = this.getBits(8); vp(v).octaveShift = this.getBits(7); vp(v).sustain = this.getBits(7); }
			this.patchParamsData[slotIdx] = params;
			return 'Patch settings: varCount=' + varCount;
		}
		if (areaIdx > 2) return 'Area=' + areaIdx;
		this.areas[this.aof + areaIdx].paramaterDataOfs = data.byteOffset;
		this.areas[this.aof + areaIdx].nummod = nummod;
		for (let i = 0; i < nummod; i++) {
			const index = this.getBits(8);
			const m = this.findModule(this.aof + areaIdx, index);
			if (!m) continue;
			const paramcnt = this.getBits(7);
			for (let v = 0; v < numvar; v++) {
				const variation = this.getBits(8);
				for (let p = 0; p < paramcnt; p++) {
					if (p < m.pcnt) m.lv[variation * m.pcnt + p] = this.getBits(7);
					else this.getBits(7);
				}
			}
		}
		return 'Area=' + areaIdx + ':ModuleCount=' + nummod + ':VariationCount=' + numvar;
	}

	private parseCableList(data: Uint8Array): string {
		const areaIdx = this.getBits(2, data);
		this.getBits(6);
		const numcab = this.getBits(16);
		if (areaIdx > 1) return 'Patch settings, whatever';
		this.areas[this.aof + areaIdx].numcab = numcab;
		const cableList: Cable[] = [];
		for (let i = 0; i < numcab; i++) {
			const cable: Cable = {
				colour: this.getBits(3),
				smod: this.getBits(8),
				scon: this.getBits(6),
				dir: this.getBits(1),
				dmod: this.getBits(8),
				dcon: this.getBits(6),
			};
			cableList.push(cable);
		}
		this.areas[this.aof + areaIdx].cableList = cableList;
		return 'Area=' + areaIdx + ':CableCount=' + numcab;
	}

	private parsePrfData(data: Uint8Array): void {
		// 0x11 section: 8-byte header, then 4 × (null-terminated name + 10 bytes extra data)
		let ofs = 8;
		const slotNames: string[] = [];
		for (let i = 0; i < 4; i++) {
			let str = '';
			while (ofs < data.length && data[ofs] !== 0) str += String.fromCharCode(data[ofs++]);
			ofs++; // skip null terminator
			ofs += 10; // skip extra slot data
			slotNames.push(str);
		}
		this.slots.length = 0;
		this.slots.push(...slotNames);
	}

	private parsePatchDesc(data: Uint8Array): void {
		const description_attrs: Record<string, number> = {
			voices: 5,
			height: 14,
			unk2: 3,
			red: 1,
			blue: 1,
			yellow: 1,
			orange: 1,
			green: 1,
			purple: 1,
			white: 1,
			monopoly: 2,
			variation: 8,
			category: 8,
		};
		this.getBits(7 * 8 + 5, data);
		for (const a in description_attrs) description_attrs[a] = this.getBits(description_attrs[a]);
		this.pd[this.aof >> 1] = description_attrs as unknown as PatchDescription;
	}

	private getModuleByName(areaIdx: number, name: string): ModuleInstance | null {
		for (let i = 0; i < this.areas[areaIdx].modules.length; i++) if (this.areas[areaIdx].modules[i].uname == name) return this.areas[areaIdx].modules[i];
		return null;
	}
}

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

export class PatchParser {
	private patcher: G2Parser;

	constructor(buffer: ArrayBuffer) {
		this.patcher = new G2Parser(buffer);
	}

	parse(): Patch {
		return {
			areas: [this.patcher.getArea(0), this.patcher.getArea(1)],
			description: this.patcher.getpd(0) ?? undefined,
			patchParams: this.patcher.getPatchParams(0) ?? undefined,
		};
	}

	parsePrf2(): { slotNames: string[]; patches: Patch[] } | null {
		const slotNames = this.patcher.isPrf2();
		if (slotNames.length === 0) return null;
		return {
			slotNames,
			patches: [0, 1, 2, 3].map((slot) => ({
				areas: [this.patcher.getArea(slot * 2), this.patcher.getArea(slot * 2 + 1)],
				description: this.patcher.getpd(slot) ?? undefined,
				patchParams: this.patcher.getPatchParams(slot) ?? undefined,
			})),
		};
	}
}
