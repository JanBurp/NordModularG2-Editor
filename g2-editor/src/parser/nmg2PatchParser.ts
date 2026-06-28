/**
 * prf2 file is very similar but contains extra section type 0x11 at beginning which contains slot names and slot data
 */

import type { Area, Cable, Patch, PatchDescription, PatchParamVariation, MidiCCAssignment } from '../types/patch';
import type { ModuleInstance, ParamLabel } from '../types/module';

import { SectionType } from './constants';
import { getModule } from '../renderer/nmg2mods';

export type { ModuleInstance, ParamLabel, Area, Cable, Patch, PatchDescription, PatchParamVariation, MidiCCAssignment };

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
	private slotMeta: Array<{ active: boolean; key: boolean; hold: boolean; bank: number; patch: number; rangeLow: number; rangeHigh: number }> = [];
	private aof = 0;
	private textpadofs = 0;
	private textpadlen = 0;
	private rawData: Uint8Array = new Uint8Array(0);
	private bitofs = 0;
	private patchParamsData: PatchParamVariation[][] = [];
	private pd: (PatchDescription | null)[] = [];
	private controllersData: MidiCCAssignment[] = [];
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
			[SectionType.CONTROLLERS]: ['Controllers', (d) => this.parseControllers(d)],
		};

		const hdr = new Uint8Array(data, 0, 320);
		const str = new TextDecoder('latin1').decode(hdr);
		let ofs = str.indexOf('\0');
		const textHdrLen = ofs + 3;
		const filedata = new DataView(data, ofs + 3, data.byteLength - ofs - 5);
		this.ofs = ofs;
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
		if (this.bitofs + numbits > this.rawData.length * 8)
			throw new RangeError(`getBits: read past end of section (bit ${this.bitofs}, requesting ${numbits}, section is ${this.rawData.length * 8} bits)`);
		let rv = (this.rawData[this.bitofs >> 3] >> (7 - (this.bitofs & 7))) & 1;
		this.bitofs++;
		while (numbits > 1) {
			rv = (rv << 1) | ((this.rawData[this.bitofs >> 3] >> (7 - (this.bitofs & 7))) & 1);
			this.bitofs++;
			numbits--;
		}
		return rv;
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
				const paramIndex = paramLen > 0 ? this.getBits(8) : 0;
				bytesRemaining -= paramLen > 0 ? 3 : 2;
				const entry: ParamLabel = {
					paramIndex,
					isString: isString === 1,
					paramLen,
					labels: [],
				};
				if (paramLen - 1 > 0) {
					const labelCount = Math.min(
						Math.floor((paramLen - 1) / 7),
						Math.floor(bytesRemaining / 7), // clamp: guards against corrupt paramLen
					);
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
				if (!params[v])
					params[v] = {
						patchVol: 0,
						activeMuted: 0,
						glide: 0,
						glideTime: 0,
						bend: 0,
						semi: 0,
						vibrato: 0,
						cents: 0,
						rate: 0,
						arpeggiator: 0,
						arpTime: 0,
						arpType: 0,
						octaveShift: 0,
						sustain: 0,
						octaves: 0,
						morphDials: [0, 0, 0, 0, 0, 0, 0, 0],
						morphModes: [0, 0, 0, 0, 0, 0, 0, 0],
					};
				return params[v];
			};
			// Section 1: Morphs
			this.getBits(8);
			this.getBits(7); // sub-section ID + count
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				for (let j = 0; j < 8; j++) vp(v).morphDials[j] = this.getBits(7);
				for (let j = 0; j < 8; j++) vp(v).morphModes[j] = this.getBits(7);
			}
			// Section 2: Volume
			this.getBits(8);
			this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				vp(v).patchVol = this.getBits(7);
				vp(v).activeMuted = this.getBits(7);
			}
			// Section 3: Glide
			this.getBits(8);
			this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				vp(v).glide = this.getBits(7);
				vp(v).glideTime = this.getBits(7);
			}
			// Section 4: Bend
			this.getBits(8);
			this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				vp(v).bend = this.getBits(7);
				vp(v).semi = this.getBits(7);
			}
			// Section 5: Vibrato
			this.getBits(8);
			this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				vp(v).vibrato = this.getBits(7);
				vp(v).cents = this.getBits(7);
				vp(v).rate = this.getBits(7);
			}
			// Section 6: Arp
			this.getBits(8);
			this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				vp(v).arpeggiator = this.getBits(7);
				vp(v).arpTime = this.getBits(7);
				vp(v).arpType = this.getBits(7);
				vp(v).octaves = this.getBits(7);
			}
			// Section 7: Octave shift
			this.getBits(8);
			this.getBits(7);
			for (let i = 0; i < varCount; i++) {
				const v = this.getBits(8);
				vp(v).octaveShift = this.getBits(7);
				vp(v).sustain = this.getBits(7);
			}
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
		// 10 bytes: active, key, hold, bank, patch, rangeLow, rangeHigh, 3×padding
		let ofs = 8;
		const slotNames: string[] = [];
		this.slotMeta.length = 0;
		for (let i = 0; i < 4; i++) {
			let str = '';
			while (ofs < data.length && data[ofs] !== 0) str += String.fromCharCode(data[ofs++]);
			ofs++; // skip null terminator
			if (ofs + 10 <= data.length) {
				this.slotMeta.push({
					active: data[ofs] !== 0,
					key: data[ofs + 1] !== 0,
					hold: data[ofs + 2] !== 0,
					bank: data[ofs + 3],
					patch: data[ofs + 4],
					rangeLow: data[ofs + 5],
					rangeHigh: data[ofs + 6],
				});
			}
			ofs += 10;
			slotNames.push(str);
		}
		this.slots.length = 0;
		this.slots.push(...slotNames);
	}

	getSlotMeta() {
		return this.slotMeta;
	}

	getControllers(): MidiCCAssignment[] {
		return this.controllersData;
	}

	private parseControllers(data: Uint8Array): void {
		const count = this.getBits(7, data);
		const list: MidiCCAssignment[] = [];
		for (let i = 0; i < count; i++) {
			const cc = this.getBits(7);
			const location = this.getBits(2) as 0 | 1 | 2;
			const moduleIndex = this.getBits(8);
			const paramIndex = this.getBits(7);
			list.push({ cc, location, moduleIndex, paramIndex });
		}
		this.controllersData = list;
	}

	private parsePatchDesc(data: Uint8Array): void {
		const description_attrs: Record<string, number> = {
			voices: 5,
			height: 14,
			octaveShift: 3,
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

export class PatchParser {
	private patcher: G2Parser;

	constructor(buffer: ArrayBuffer) {
		this.patcher = new G2Parser(buffer);
	}

	parse(): Patch {
		const controllers = this.patcher.getControllers();
		return {
			areas: [this.patcher.getArea(0), this.patcher.getArea(1)],
			description: this.patcher.getpd(0) ?? undefined,
			patchParams: this.patcher.getPatchParams(0) ?? undefined,
			controllers: controllers.length > 0 ? controllers : undefined,
		};
	}

	parsePrf2(): { slotNames: string[]; patches: Patch[]; slotMeta: ReturnType<G2Parser['getSlotMeta']> } | null {
		const slotNames = this.patcher.isPrf2();
		if (slotNames.length === 0) return null;
		const controllers = this.patcher.getControllers();
		return {
			slotNames,
			patches: [0, 1, 2, 3].map((slot) => ({
				areas: [this.patcher.getArea(slot * 2), this.patcher.getArea(slot * 2 + 1)],
				description: this.patcher.getpd(slot) ?? undefined,
				patchParams: this.patcher.getPatchParams(slot) ?? undefined,
				controllers: controllers.length > 0 ? controllers : undefined,
			})),
			slotMeta: this.patcher.getSlotMeta(),
		};
	}
}
