/**
 * Clavia Nord Modular G2 pch2 file reader writer
 * Adapted from g2ools python utility at https://github.com/msg/g2-tools
 *
 * prf2 file is very similar but contains extra section type 0x11 at beginning which contains slot names and slot data
 */

import { getModule } from '../renderer/nmg2mods';
import type { ModuleDefinition } from '../types/index';

export interface ModuleInstance {
	index: number;
	type: number;
	horiz: number;
	vert: number;
	colour: number;
	uprate: number;
	leds: number;
	pcnt: number;
	lv: number[];
	modes: number[];
	uname?: string;
	[key: string]: unknown;
}

export interface Cable {
	colour: number;
	smod: number;
	scon: number;
	dir: number;
	dmod: number;
	dcon: number;
	[key: string]: unknown;
}

export interface Area {
	name: string;
	modules: ModuleInstance[];
	cableList: Cable[];
	paramaterDataOfs: number;
	nummod?: number;
	numcab?: number;
	[key: string]: unknown;
}

export interface PatchDescription {
	voices: number;
	height: number;
	unk2: number;
	red: number;
	blue: number;
	yellow: number;
	orange: number;
	green: number;
	purple: number;
	white: number;
	monopoly: number;
	variation: number;
	category: number;
}

export interface Patch {
	areas: [Area, Area];
	description?: PatchDescription;
	mode?: { area: 0 | 1; variation: number };
}

function pch2_(data: ArrayBuffer, filename: string) {
	const slots: string[] = [];
	const self = this;

	class Area implements Area {
		name: string;
		modules: ModuleInstance[] = [];
		paramaterDataOfs = 0;
		nummod?: number;
		numcab?: number;

		constructor(name: string) {
			this.name = name;
		}
	}

	const areas = [new Area('fx'), new Area('voice')];
	let aof = 0;
	let textpadofs = 0;
	let textpadlen = 0;
	let bitArray: number[] = [];
	let bitofs = 0;
	let bitbuf: number[] = [];

	this.getAllModules = (areaIdx: number) => areas[areaIdx].modules;

	this.getAllCables = (areaIdx: number) => areas[areaIdx].cableList;

	this.getTextPad = () => {
		if (textpadlen == 0) return null;
		let rv = '';
		const dv = new DataView(self.data);
		for (let i = 0; i < textpadlen; i++) rv += String.fromCharCode(dv.getUint8(textpadofs + i));
		return rv;
	};

	this.setTextPad = (str: string) => {
		if (textpadlen == 0) return;
		const dv = new DataView(self.data);
		for (let i = 0; i < Math.min(str.length, textpadlen); i++) dv.setUint8(textpadofs + i, str.charCodeAt(i));
	};

	this.getArea = (areaIndex: number) => areas[areaIndex];

	this.getUrl = () => {
		const blob = new Blob([self.data], {
			type: 'application/octet-binary',
		});
		return URL.createObjectURL(blob);
	};

	function getBits(numbits: number, initialData?: Uint8Array, maxreq?: number) {
		if (initialData) {
			bitArray = [];
			const max = maxreq || initialData.length;
			for (let i = 0; i < max; i++) for (let j = 0x80; j > 0; j = j >> 1) bitArray.push(initialData[i] & j ? 1 : 0);
			bitofs = 0;
		}
		let rv = bitArray[bitofs];
		bitofs += 1;
		while (numbits > 1) {
			rv = (rv << 1) + bitArray[bitofs];
			bitofs += 1;
			numbits -= 1;
		}
		return rv;
	}

	function setBits(numbits: number, byte: number) {
		if (bitbuf == undefined) bitbuf = [];
		if (numbits) {
			for (let bw = Math.pow(2, numbits - 1); bw; bw = bw >> 1) bitbuf.push(byte & bw ? 1 : 0);
		} else {
			const bytes = new Int8Array(Math.ceil(bitbuf.length / 8));
			for (let i = 0; i < bitbuf.length; i++) {
				const bofs = Math.floor(i / 8);
				if (bitbuf[i]) bytes[bofs] |= Math.pow(2, 7 - (i % 8));
			}
			bitbuf = [];
			return bytes;
		}
	}

	function findModule(areaIdx: number, index: number): ModuleInstance | null {
		for (let i = 0; i < areas[areaIdx].modules.length; i++) {
			if (areas[areaIdx].modules[i].index == index) return areas[areaIdx].modules[i];
		}
		return null;
	}

	function setModuleName(areaIdx: number, index: number, name: string) {
		findModule(aof + areaIdx, index)!.uname = name;
	}

	function parseModuleNames(data: Uint8Array) {
		const areaIdx = getBits(2, data, 2);
		getBits(6);
		const nummod = getBits(8);
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
			setModuleName(areaIdx, index, str);
		}
		return 'Area=' + areaIdx + ':Count=' + nummod;
	}

	function parseModuleList(data: Uint8Array) {
		const areaIdx = getBits(2, data);
		const nummod = getBits(8);
		for (let i = 0; i < nummod; i++) {
			const modtype = getBits(8);
			const modDef = getModule(modtype);
			if (!modDef) {
				console.error(`Module type ${modtype} not found in module definitions`);
				continue;
			}
			const mod: ModuleInstance = Object.create(modDef) as ModuleInstance;
			mod.pcnt = modDef.params?.length || 0;
			mod.lv = Array(mod.pcnt * 9);
			mod.index = getBits(8);
			mod.type = modtype;
			mod.horiz = getBits(7);
			mod.vert = getBits(7);
			mod.colour = getBits(8);
			mod.uprate = getBits(1);
			mod.leds = getBits(1);
			getBits(6);
			const nmodes = getBits(4);
			mod.modes = [];
			for (let j = 0; j < nmodes; j++) mod.modes.push(getBits(6));
			areas[aof + areaIdx].modules.push(mod);
		}
		return 'Area=' + areaIdx + ':Count=' + nummod;
	}

	function parseTextPad(data: Uint8Array) {
		textpadlen = data.length;
		textpadofs = data.byteOffset;
	}

	function parseModuleParameters(data: Uint8Array) {
		const areaIdx = getBits(2, data);
		const nummod = getBits(8);
		const numvar = getBits(8);
		if (areaIdx > 1) return 'Patch settings, whatever';
		areas[aof + areaIdx].paramaterDataOfs = data.byteOffset;
		areas[aof + areaIdx].nummod = nummod;
		for (let i = 0; i < nummod; i++) {
			const index = getBits(8);
			const m = findModule(aof + areaIdx, index);
			if (!m) continue;
			const paramcnt = getBits(7);
			for (let v = 0; v < numvar; v++) {
				const variation = getBits(8);
				for (let p = 0; p < paramcnt; p++) {
					if (p < m.pcnt) m.lv[variation * m.pcnt + p] = getBits(7);
					else getBits(7);
				}
			}
		}
		return 'Area=' + areaIdx + ':ModuleCount=' + nummod + ':VariationCount=' + numvar;
	}

	function parseCableList(data: Uint8Array) {
		const areaIdx = getBits(2, data);
		getBits(6);
		const numcab = getBits(16);
		if (areaIdx > 1) return 'Patch settings, whatever';
		areas[aof + areaIdx].numcab = numcab;
		const cableList: Cable[] = [];
		for (let i = 0; i < numcab; i++) {
			const cable: Cable = {
				colour: getBits(3),
				smod: getBits(8),
				scon: getBits(6),
				dir: getBits(1),
				dmod: getBits(8),
				dcon: getBits(6),
			};
			cableList.push(cable);
		}
		areas[aof + areaIdx].cableList = cableList;
		return 'Area=' + areaIdx + ':CableCount=' + numcab;
	}

	function parsePrfData(data: Uint8Array) {
		let ofs = 8;
		const slotNames: string[] = [];
		for (let i = 0; i < 4; i++) {
			let str = '';
			for (let j = 0; j < 16; j++) {
				const charcode = data[ofs + j];
				if (charcode) str += String.fromCharCode(charcode);
				else break;
			}
			ofs += 17;
			ofs += 10;
			slotNames.push(str);
		}
		slots.length = 0;
		slots.push(...slotNames);
	}

	this.isPrf2 = (): string[] => slots;

	const pd: (PatchDescription | null)[] = [];
	function parsePatchDesc(data: Uint8Array) {
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
		getBits(7 * 8 + 5, data);
		for (const a in description_attrs) description_attrs[a] = getBits(description_attrs[a]);
		pd[aof >> 1] = description_attrs as PatchDescription;
	}

	this.getpd = (slot: number) => pd[slot];

	this.writeParameters = (areanum: number) => {
		const area = areas[areanum];
		setBits(2, areanum);
		setBits(8, area.nummod || 0);
		setBits(8, area.nummod ? 9 : 0);
		for (let i = 0; i < area.modules.length; i++) {
			const m = area.modules[i];
			if (m.pcnt == 0) continue;
			setBits(8, m.index);
			setBits(7, m.pcnt);
			for (let v = 0; v < 9; v++) {
				setBits(8, v);
				for (let p = 0; p < m.pcnt; p++) setBits(7, m.lv[v * m.pcnt + p]);
			}
		}
		const dataArray = new Int8Array(self.data);
		dataArray.set(setBits(0) as Int8Array, area.paramaterDataOfs);
		const ofs = this.ofs;
		const filedataArray = new Uint8Array(self.data, ofs + 1, dataArray.byteLength - ofs - 3);
		const calcCRC = calcCrc(filedataArray);
		dataArray.set([Math.floor(calcCRC / 256), calcCRC % 256], self.data.byteLength - 2);
	};

	function getModuleByName(areaIdx: number, name: string): ModuleInstance | null {
		for (let i = 0; i < areas[areaIdx].modules.length; i++) if (areas[areaIdx].modules[i].uname == name) return areas[areaIdx].modules[i];
		return null;
	}

	this.getModuleArray = (areaIdx: number, basename: string): ModuleInstance[] => {
		const array: ModuleInstance[] = [];
		let i = 0;
		let m: ModuleInstance | null;
		while ((m = getModuleByName(areaIdx, basename + i))) {
			i += 1;
			array.push(m);
		}
		return array;
	};

	const g2section: Record<number, [string, (data: Uint8Array) => string | undefined]> = {
		0x21: ['Patch Description', parsePatchDesc],
		0x5a: ['Module Names', parseModuleNames],
		0x4a: ['Module List', parseModuleList],
		0x6f: ['Text Pad', parseTextPad],
		0x11: ['Perf data', parsePrfData],
		0x52: ['Cable List', parseCableList],
		0x4d: ['Parameters', parseModuleParameters],
	};

	const hdr = new Uint8Array(data, 0, 320);
	const str = String.fromCharCode.apply(null, hdr as unknown as number[]);
	let ofs = str.indexOf('\0');
	const textHdrLen = ofs + 3;
	const fileCRC = new DataView(data).getInt16(data.byteLength - 2) & 0xffff;
	const filedata = new DataView(data, ofs + 3, data.byteLength - ofs - 5);
	this.ofs = ofs;
	const filedataArray = new Uint8Array(data, ofs + 1, data.byteLength - ofs - 3);
	const calcCRC = calcCrc(filedataArray);
	if (fileCRC != calcCRC) {
		console.warn('PCH2 WARNING: CRC mismatch');
	}

	const maxofs = filedata.byteLength;
	ofs = 0;
	let res = '';
	while (ofs < maxofs) {
		const type = filedata.getInt8(ofs);
		const siz = filedata.getInt16(ofs + 1);
		if (type in g2section) {
			res += '\n' + g2section[type][0] + ':offset=0x' + (textHdrLen + ofs).toString(16);
			if (g2section[type][1]) res += g2section[type][1](new Int8Array(data, textHdrLen + ofs + 3, siz));
		}
		ofs += siz + 3;
		if (type == 0x6f) {
			if (ofs < maxofs) {
				areas.push(new Area('fx'));
				areas.push(new Area('voice'));
				aof += 2;
			}
		}
	}
	return this;
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
	private patcher: ReturnType<typeof pch2_>;

	constructor(buffer: ArrayBuffer) {
		this.patcher = new pch2_(buffer, '') as unknown as ReturnType<typeof pch2_>;
	}

	parse(): Patch {
		return {
			areas: [this.patcher.getArea(0) as Area, this.patcher.getArea(1) as Area],
			description: this.patcher.getpd(0),
		};
	}
}
