/**
 * prf2 file is very similar but contains extra section type 0x11 at beginning which contains slot names and slot data
 */

import type {
	Area,
	Cable,
	Patch,
	PatchDescription,
	PatchParamVariation,
	MidiCCAssignment,
	ParamPageAssignment,
	GlobalParamPageAssignment,
} from '../types/patch';
import type { ModuleInstance, ParamLabel } from '../types/module';

import { SectionType, PATCH_MORPH_MODULE_ID } from './constants';
import { getModule } from '../renderer/nmg2mods';
import { SLOT_LABELS } from '../constants';
import { SEQNOTE_MODULE_TYPE, type PianoRollView } from '../renderer/pianoRoll';

export type {
	ModuleInstance,
	ParamLabel,
	Area,
	Cable,
	Patch,
	PatchDescription,
	PatchParamVariation,
	MidiCCAssignment,
	ParamPageAssignment,
	GlobalParamPageAssignment,
};

// Strips a .pch2/.prf2's file header ([name][0x00][version][file type]) and returns the section
// bytes — including the trailing 2-byte CRC — as a hex string, the `rawHex` form the serializer
// takes as its template.
export function stripFileHeader(bytes: number[] | Uint8Array): string {
	let ofs = 0;
	while (ofs < bytes.length && bytes[ofs] !== 0) ofs++;
	return Array.from((bytes as any).slice(ofs + 3))
		.map((b: unknown) => (b as number).toString(16).padStart(2, '0'))
		.join('');
}

// Reads bits MSB-first from a byte array, advancing an internal offset — mirrors BitWriter's
// bit-accumulation logic (nmg2PatchSerializer.ts) in reverse. Shared by G2Parser.getBits (which
// resets/reuses one instance across an entire file's worth of sections) and parseGlobalKnobsChunk
// (which reads a single standalone chunk).
class BitReader {
	private data: Uint8Array = new Uint8Array(0);
	bitofs = 0;

	reset(data: Uint8Array): void {
		this.data = data;
		this.bitofs = 0;
	}

	read(numbits: number, label: string): number {
		if (this.bitofs + numbits > this.data.length * 8)
			throw new RangeError(`${label}: read past end of section (bit ${this.bitofs}, requesting ${numbits}, section is ${this.data.length * 8} bits)`);
		let rv = (this.data[this.bitofs >> 3] >> (7 - (this.bitofs & 7))) & 1;
		this.bitofs++;
		while (numbits > 1) {
			rv = (rv << 1) | ((this.data[this.bitofs >> 3] >> (7 - (this.bitofs & 7))) & 1);
			this.bitofs++;
			numbits--;
		}
		return rv;
	}
}

// Reads one knob-slot record: a presence bit, then (when present) location/moduleIndex/isLed/
// paramIndex, plus — for the Global Knobs variant — a trailing 2-bit slot field (0-3 = A-D).
// Shared by G2Parser.parseKnobs and parseGlobalKnobsChunk, which differ only in that trailing
// field. Returns null when the slot's presence bit is unset.
function readKnobSlotRecord(
	reader: BitReader,
	hasSlotField: boolean,
	label: string,
): { location: 0 | 1; moduleIndex: number; isLed: number; paramIndex: number; slotBits: number } | null {
	const assigned = reader.read(1, label);
	if (!assigned) return null;
	const location = reader.read(2, label) as 0 | 1;
	const moduleIndex = reader.read(8, label);
	const isLed = reader.read(2, label);
	const paramIndex = reader.read(7, label);
	const slotBits = hasSlotField ? reader.read(2, label) : 0;
	return { location, moduleIndex, isLed, paramIndex, slotBits };
}

// Parses a raw C_KNOBS_GLOBAL ($5f) chunk payload — same 16-bit-count + per-slot-entry layout as
// parseKnobs (see G2Parser.parseKnobs below), plus a trailing 2-bit slot field (0-3 = A-D) per
// entry, since a Global Page slot can target a module in any of the 4 patches (see
// GlobalParamPageAssignment in types/patch.ts). Exported standalone (not a G2Parser method)
// because it's also used to decode the live get-global-knobs CLI response, which hands back just
// this chunk's bytes, not a whole pch2/prf2 file to wrap in a G2Parser instance.
export function parseGlobalKnobsChunk(data: Uint8Array): GlobalParamPageAssignment[] {
	const reader = new BitReader();
	reader.reset(data);
	const count = reader.read(16, 'parseGlobalKnobsChunk');
	const list: GlobalParamPageAssignment[] = [];
	for (let slotIndex = 0; slotIndex < count; slotIndex++) {
		const rec = readKnobSlotRecord(reader, true, 'parseGlobalKnobsChunk');
		if (!rec) continue;
		list.push({
			slotIndex,
			slot: SLOT_LABELS[rec.slotBits],
			location: rec.location,
			moduleIndex: rec.moduleIndex,
			isLed: rec.isLed,
			paramIndex: rec.paramIndex,
		});
	}
	return list;
}

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
	private textpad: string[] = [];
	private reader = new BitReader();
	private patchParamsData: PatchParamVariation[][] = [];
	private morphParamLabelsData: ParamLabel[][] = [];
	private morphKeyboardAssignData: number[][] = [];
	private pd: (PatchDescription | null)[] = [];
	// CONTROLLERS ($60) and C_KNOBS ($62) are both per-patch, so both are stored per-slot-index
	// here (mirroring patchParamsData) — a .prf2's 4 slots would otherwise collide. controllersData
	// used to be a single shared list: the last slot parsed won, and every slot was then
	// re-serialized with that one's MIDI-CC assignments, corrupting three of four slots on
	// Performance → Download.
	private controllersData: MidiCCAssignment[][] = [];
	private knobsData: ParamPageAssignment[][] = [];
	// Performance-scoped (not per-slot, unlike knobsData) — see GlobalParamPageAssignment.
	private globalKnobsData: GlobalParamPageAssignment[] = [];
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
			[SectionType.KNOBS]: ['Knobs', (d) => this.parseKnobs(d)],
			[SectionType.MORPH_PARAMS]: ['Morph Parameters', (d) => this.parseMorphParameters(d)],
			[SectionType.KNOBS_GLOBAL]: [
				'Global Knobs',
				(d) => {
					this.globalKnobsData = parseGlobalKnobsChunk(d);
				},
			],
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

	getTextPad(slot: number): string | null {
		return this.textpad[slot] ?? null;
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

	getMorphParamLabels(slot: number): ParamLabel[] | null {
		return this.morphParamLabelsData[slot] ?? null;
	}

	getMorphKeyboardAssign(slot = 0): number[] | null {
		return this.morphKeyboardAssignData[slot] ?? null;
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
		if (initialData) this.reader.reset(initialData);
		return this.reader.read(numbits, 'getBits');
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
		// area 2 = morph-group labels, added alongside areas 0/1 (fx/voice) below.
		if (areaIdx > 2) return 'Area=' + areaIdx;
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
				if (areaIdx === 2) {
					if (modIdx === PATCH_MORPH_MODULE_ID) this.morphParamLabelsData[this.aof >> 1] = entries;
				} else {
					const m = this.findModule(this.aof + areaIdx, modIdx);
					if (m) {
						// SeqNote's Magnifier/Octave-offset widgets (CPnlNoteSeqZoom/CPnlNoteSeqOffset in the
						// original editor) persist through this same generic container, as two positional,
						// unlabeled byte entries (isString=false, paramLen=1) — zoom first, then octave
						// offset. Peel those off into pianoRollView; any real label entries (e.g. a renamed
						// jack) are left in paramLabels as before.
						const viewEntries = m.type === SEQNOTE_MODULE_TYPE ? entries.filter((e) => !e.isString && e.paramLen === 1) : [];
						if (viewEntries.length >= 2) {
							const [zoomEntry, offsetEntry] = viewEntries;
							m.pianoRollView = { zoom: zoomEntry.paramIndex as PianoRollView['zoom'], octaveOffset: offsetEntry.paramIndex };
							const remaining = entries.filter((e) => e !== zoomEntry && e !== offsetEntry);
							if (remaining.length > 0) m.paramLabels = remaining;
						} else {
							m.paramLabels = entries;
						}
					}
				}
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
		let str = '';
		for (let i = 0; i < data.length; i++) str += String.fromCharCode(data[i]);
		this.textpad[this.aof >> 1] = str;
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
						morphAssignments: [],
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

	// Per-parameter Morph Group assignment ($65, "C_MORPH_PARAM" in the reference Delphi editor).
	// A separate top-level chunk from the PARAMETERS/$4d section above (which only holds the morph
	// dial/mode values, patch volume, glide, etc.) — reverse-engineered from BVE.NMG2File.pas
	// (TMorphParameters.Read/Write). Presence of a record is the assignment; a record's Range is
	// never 0 (Delphi deletes the record when Range hits 0).
	private parseMorphParameters(data: Uint8Array): string {
		const slotIdx = this.aof >> 1;
		const params = this.patchParamsData[slotIdx];
		if (!params) return 'Morph Parameters: no matching PARAMETERS section';
		const variationCount = this.getBits(8, data);
		const morphCount = this.getBits(4); // NMORPHS, always 8
		// One 2-bit keyboard-morph-assign value per morph group — morphCount of them, so 16 bits
		// in practice. The reference writer (G2Editor.c CMorphMapData_11::WriteStream) emits
		// exactly this; an earlier reading of a flat 20 stole 4 bits from the first variation's
		// index and paid them back with a filler between variations, leaving the chunk 4 bits
		// too long (which the G2 rejects — see the serializer).
		const keyboardAssign: number[] = [];
		for (let i = 0; i < morphCount; i++) keyboardAssign.push(this.getBits(2));
		this.morphKeyboardAssignData[slotIdx] = keyboardAssign;
		let total = 0;
		for (let i = 0; i < variationCount; i++) {
			const variationIndex = this.getBits(8);
			for (let j = 0; j < morphCount; j++) this.getBits(7); // per-morph reserved, always 0
			const morphParamCount = this.getBits(8);
			const target = params[variationIndex];
			for (let j = 0; j < morphParamCount; j++) {
				const location = this.getBits(2) as 0 | 1;
				const moduleIndex = this.getBits(8);
				const paramIndex = this.getBits(7);
				const groupIndex = this.getBits(4);
				const raw = this.getBits(8);
				const range = raw > 127 ? raw - 256 : raw;
				target?.morphAssignments.push({ groupIndex, location, moduleIndex, paramIndex, range });
			}
			total += morphParamCount;
		}
		return 'Morph Parameters: count=' + total;
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

	getControllers(slot = 0): MidiCCAssignment[] {
		return this.controllersData[slot] ?? [];
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
		this.controllersData[this.aof >> 1] = list;
	}

	getKnobs(slot: number): ParamPageAssignment[] | null {
		return this.knobsData[slot] ?? null;
	}

	// Parameter Pages knob assignments ($62, "C_KNOBS" in the reference Delphi editor). Fixed-size
	// array of 120 slots (3 Banks x 5 Pages x 8 Knobs, see renderer/paramPages.ts) — the 16-bit count
	// is always 120, and slot position (not a stored field) is the slot's address. Each slot is a
	// single presence bit, followed by 20 bits of assignment data when present. Reverse-engineered
	// from BVE.NMG2File.pas's TKnob.Read/TKnobList.Read, cross-validated against decompiled
	// G2Editor.c's NSFile_V11::CKnobMapData_11::WriteStream. Per-patch, like CONTROLLERS ($60), not
	// per-variation like MORPH_PARAMS ($65).
	private parseKnobs(data: Uint8Array): void {
		const count = this.getBits(16, data);
		const list: ParamPageAssignment[] = [];
		for (let slotIndex = 0; slotIndex < count; slotIndex++) {
			const rec = readKnobSlotRecord(this.reader, false, 'getBits');
			if (!rec) continue;
			list.push({ slotIndex, location: rec.location, moduleIndex: rec.moduleIndex, isLed: rec.isLed, paramIndex: rec.paramIndex });
		}
		this.knobsData[this.aof >> 1] = list;
	}

	getGlobalKnobs(): GlobalParamPageAssignment[] {
		return this.globalKnobsData;
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

	// Builds the Patch object for one slot (0 for a plain .pch2; 0-3 for a .prf2's four slots).
	// Shared by parse() and parsePrf2(), which differ only in which slot(s) they build and how
	// many slots' worth of areas exist — a slot's areas always sit at [slot*2, slot*2+1].
	private buildPatchForSlot(slot: number, controllers: MidiCCAssignment[]): Patch {
		const paramPages = this.patcher.getKnobs(slot);
		return {
			areas: [this.patcher.getArea(slot * 2), this.patcher.getArea(slot * 2 + 1)],
			description: this.patcher.getpd(slot) ?? undefined,
			patchParams: this.patcher.getPatchParams(slot) ?? undefined,
			controllers: controllers.length > 0 ? controllers : undefined,
			paramPages: paramPages && paramPages.length > 0 ? paramPages : undefined,
			text: this.patcher.getTextPad(slot) ?? undefined,
			morphParamLabels: this.patcher.getMorphParamLabels(slot) ?? undefined,
			morphKeyboardAssign: this.patcher.getMorphKeyboardAssign(slot) ?? undefined,
		};
	}

	parse(): Patch {
		const controllers = this.patcher.getControllers();
		return this.buildPatchForSlot(0, controllers);
	}

	parsePrf2(): {
		slotNames: string[];
		patches: Patch[];
		slotMeta: ReturnType<G2Parser['getSlotMeta']>;
		globalParamPages: GlobalParamPageAssignment[];
	} | null {
		const slotNames = this.patcher.isPrf2();
		if (slotNames.length === 0) return null;
		return {
			slotNames,
			patches: [0, 1, 2, 3].map((slot) => this.buildPatchForSlot(slot, this.patcher.getControllers(slot))),
			slotMeta: this.patcher.getSlotMeta(),
			globalParamPages: this.patcher.getGlobalKnobs(),
		};
	}
}
