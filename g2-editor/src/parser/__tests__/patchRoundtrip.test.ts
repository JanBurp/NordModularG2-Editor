import type { Cable, GlobalParamPageAssignment, ModuleInstance, ParamLabel, Patch } from '@/types';
import { describe, expect, it } from 'vitest';
import { mutAddCable, mutAddModule, mutDeleteCable, mutDeleteModule, mutMoveModule, mutSetPianoRollView } from '../patchMutations';

import { PatchParser } from '../nmg2PatchParser';
import { PATCH_MORPH_MODULE_ID, SectionType } from '../constants';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { buildPerformanceTemplate, serializePatch, serializePerformance, setFileDescription, writePerfSettings } from '../nmg2PatchSerializer';
import { extractVariations } from '../../store/slotHelpers';
import { computeUprateSet, inferUserColours } from '../cableGraph';
import { getModule } from '../../renderer/nmg2mods';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../../../test-patches');

// ── helpers ──────────────────────────────────────────────────────────────────

function loadFixture(filename: string): {
	name: string;
	rawHex: string;
	patch: Patch;
} {
	const buf = fs.readFileSync(path.join(FIXTURES, filename));
	const fileBytes = new Uint8Array(buf);
	let ofs = 0;
	while (ofs < fileBytes.length && fileBytes[ofs] !== 0) ofs++;
	const name = new TextDecoder().decode(fileBytes.slice(0, ofs));
	const rawHex = Array.from(fileBytes.slice(ofs + 3))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const patch = new PatchParser(fileBytes.buffer).parse();
	return { name, rawHex, patch };
}

function parsePatchFromRawHex(name: string, rawHex: string): Patch {
	const sectionBytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const nameBytes = new TextEncoder().encode(name);
	const pch2 = new Uint8Array(nameBytes.length + 3 + sectionBytes.length);
	pch2.set(nameBytes);
	pch2[nameBytes.length] = 0x00;
	pch2[nameBytes.length + 1] = 0x17;
	pch2[nameBytes.length + 2] = 0x00;
	pch2.set(sectionBytes, nameBytes.length + 3);
	return new PatchParser(pch2.buffer).parse();
}

// Extracts only the persisted fields of a module for comparison
function modSnap(m: ModuleInstance) {
	return {
		type: m.type,
		index: m.index,
		horiz: m.horiz,
		vert: m.vert,
		colour: m.colour,
		uprate: m.uprate,
		mutaLock: m.mutaLock,
		uname: m.uname,
		paramLabels: m.paramLabels,
		modes: [...(m.modes ?? [])],
		lv: [...(m.lv ?? [])].map((v) => v ?? 0),
	};
}

// Extracts the persisted cable fields
function cableSnap(c: Cable) {
	return {
		colour: c.colour,
		smod: c.smod,
		scon: c.scon,
		dir: c.dir,
		dmod: c.dmod,
		dcon: c.dcon,
	};
}

function expectPatchEqual(a: Patch, b: Patch) {
	for (const i of [0, 1] as const) {
		const modsA = a.areas[i].modules.map(modSnap).sort((x, y) => x.index - y.index);
		const modsB = b.areas[i].modules.map(modSnap).sort((x, y) => x.index - y.index);
		expect(modsB).toEqual(modsA);

		const cabsA = (a.areas[i].cableList ?? []).map(cableSnap);
		const cabsB = (b.areas[i].cableList ?? []).map(cableSnap);
		expect(cabsB).toEqual(cabsA);
	}
	expect(b.description).toEqual(a.description);
	expect(b.morphParamLabels ?? []).toEqual(a.morphParamLabels ?? []);
	expect(b.patchParams).toEqual(a.patchParams);
	expect(b.controllers ?? []).toEqual(a.controllers ?? []);
	expect(b.paramPages ?? []).toEqual(a.paramPages ?? []);
	expect(b.text ?? '').toEqual(a.text ?? '');
}

/**
 * Simulates the full save → load file cycle:
 *   saveSlot: prepend [name][0x00][0x17][0x00] then write
 *   handleFileLoad: scan for null terminator, slice from ofs+3 to get rawHex
 * Returns { rawHex, patch } as the app would see them after re-loading.
 */
function simulateFileSaveAndLoad(name: string, rawHex: string): { rawHex: string; patch: Patch } {
	// saveSlot path: prepend name header
	const sectionBytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const nameBytes = new TextEncoder().encode(name);
	const fileBytes = new Uint8Array(nameBytes.length + 3 + sectionBytes.length);
	fileBytes.set(nameBytes);
	fileBytes[nameBytes.length] = 0x00;
	fileBytes[nameBytes.length + 1] = 0x17;
	fileBytes[nameBytes.length + 2] = 0x00;
	fileBytes.set(sectionBytes, nameBytes.length + 3);

	// handleFileLoad path: scan for null terminator, strip header
	let nameEnd = 0;
	while (nameEnd < fileBytes.length && fileBytes[nameEnd] !== 0) nameEnd++;
	const strippedRawHex = Array.from(fileBytes.slice(nameEnd + 3))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	const patch = new PatchParser(fileBytes.buffer).parse();
	return { rawHex: strippedRawHex, patch };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('patch round-trip: parse → serialize → parse', () => {
	for (const file of ['EmptyPatch.pch2', 'Basics  NL2.pch2', 'DXBass FM4.pch2']) {
		it(file, () => {
			const { name, rawHex, patch: patchA } = loadFixture(file);
			// Guard against a vacuous comparison: non-empty fixtures must actually carry modules and cables.
			if (file !== 'EmptyPatch.pch2') {
				expect(patchA.areas[1].modules.length).toBeGreaterThan(0);
				expect((patchA.areas[1].cableList ?? []).length).toBeGreaterThan(0);
			}
			const newHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));
			const patchB = parsePatchFromRawHex(name, newHex);
			expectPatchEqual(patchA, patchB);
		});
	}
});

describe('deleteCable', () => {
	it('removes cable and leaves others intact', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const cables = patch.areas[1].cableList ?? [];
		expect(cables.length).toBeGreaterThan(0);
		const target = cables[0];
		const remainingCount = cables.length - 1;

		mutDeleteCable(patch, 1, target);
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const cabsB = patchB.areas[1].cableList ?? [];
		expect(cabsB).toHaveLength(remainingCount);
		const found = cabsB.find((c) => c.smod === target.smod && c.scon === target.scon && c.dmod === target.dmod && c.dcon === target.dcon);
		expect(found).toBeUndefined();
	});
});

describe('deleteModule', () => {
	it('removes module and its connected cables', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const modules = patch.areas[1].modules;
		const cables = patch.areas[1].cableList ?? [];
		expect(modules.length).toBeGreaterThan(0);

		// Pick first module that has at least one cable
		const target = modules.find((m) => cables.some((c) => c.smod === m.index || c.dmod === m.index))!;
		expect(target).toBeDefined();

		const connectedCables = cables.filter((c) => c.smod === target.index || c.dmod === target.index).length;
		const expectedMods = modules.length - 1;
		const expectedCables = cables.length - connectedCables;

		mutDeleteModule(patch, 1, target.index);
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.areas[1].modules).toHaveLength(expectedMods);
		expect(patchB.areas[1].cableList ?? []).toHaveLength(expectedCables);
		expect(patchB.areas[1].modules.find((m) => m.index === target.index)).toBeUndefined();
		const leftoverCables = (patchB.areas[1].cableList ?? []).filter((c) => c.smod === target.index || c.dmod === target.index);
		expect(leftoverCables).toHaveLength(0);
	});
});

describe('moveModule', () => {
	it('updates position and preserves all other fields', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const modules = patch.areas[1].modules;
		expect(modules.length).toBeGreaterThan(0);
		const target = modules[0];
		const newCol = (target.horiz + 3) % 20;
		const newRow = (target.vert + 5) % 100;

		const before = modSnap(target);
		mutMoveModule(patch, 1, target.index, newCol, newRow);
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const moved = patchB.areas[1].modules.find((m) => m.index === target.index)!;
		expect(moved).toBeDefined();
		expect(moved.horiz).toBe(newCol);
		expect(moved.vert).toBe(newRow);
		// All other fields unchanged
		expect(moved.type).toBe(before.type);
		expect(moved.colour).toBe(before.colour);
		expect(moved.modes).toEqual(before.modes);
		expect(moved.lv).toEqual(before.lv);
	});
});

describe('addModule', () => {
	it('adds module with correct fields that survive round-trip', () => {
		// Use EmptyPatch so we control the full module list
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');
		expect(patch.areas[1].modules).toHaveLength(0);

		// Keyboard module (type 1): 0 params, 0 modes, 6 outputs — simplest case
		const mod: ModuleInstance = {
			type: 1,
			index: 1,
			horiz: 3,
			vert: 7,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patch, 1, mod);
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.areas[1].modules).toHaveLength(1);
		const added = patchB.areas[1].modules[0];
		expect(added.type).toBe(1);
		expect(added.index).toBe(1);
		expect(added.horiz).toBe(3);
		expect(added.vert).toBe(7);
		expect(added.colour).toBe(0);
		expect(added.pcnt).toBe(0);
		expect(added.modes).toEqual([]);
		expect(added.lv).toEqual([]);
	});

	it('adds module with params that survive round-trip', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');

		// 2-Out module (type 4): 3 params, 0 modes
		const pcnt = 3;
		const lv: number[] = Array(pcnt * 9);
		for (let v = 0; v < 9; v++) for (let p = 0; p < pcnt; p++) lv[v * pcnt + p] = p + 10; // arbitrary distinct values

		const mod: ModuleInstance = {
			type: 4,
			index: 2,
			horiz: 1,
			vert: 2,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt,
			lv,
			modes: [],
		};
		mutAddModule(patch, 1, mod);
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const added = patchB.areas[1].modules.find((m) => m.index === 2)!;
		expect(added).toBeDefined();
		expect(added.pcnt).toBe(pcnt);
		expect(added.type).toBe(4);
		expect(added.horiz).toBe(1);
		expect(added.vert).toBe(2);
		expect(added.lv).toEqual(lv);
	});
});

describe('addCable', () => {
	it('adds cable that survives round-trip', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const existingCount = (patch.areas[1].cableList ?? []).length;

		// Use module indices that exist in FMritm (index 1 and 2 confirmed above)
		const newCable: Cable = {
			colour: 2,
			smod: 2,
			scon: 0,
			dir: 1,
			dmod: 1,
			dcon: 0,
		};
		mutAddCable(patch, 1, newCable);

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const cables = patchB.areas[1].cableList ?? [];
		expect(cables).toHaveLength(existingCount + 1);
		const found = cables.find((c) => c.smod === 2 && c.scon === 0 && c.dmod === 1 && c.dcon === 0 && c.colour === 2);
		expect(found).toBeDefined();
		expect(found!.dir).toBe(1);
		// Existing cables are untouched
		const original = loadFixture('Basics  NL2.pch2').patch.areas[1].cableList ?? [];
		expect(cables.slice(0, existingCount).map(cableSnap)).toEqual(original.map(cableSnap));
	});
});

describe('cable colour persistence (userColour inference)', () => {
	// Builds the { uprateSet, modDefMap } context inferUserColours needs, mirroring slots.ts's _uprateContext.
	function uprateContext(patch: Patch, areaIdx: 0 | 1) {
		const area = patch.areas[areaIdx];
		const areaModDefs = area.modules.map((m) => ({ index: m.index, def: getModule(m.type)! })).filter((m) => m.def !== undefined);
		const uprateSet = computeUprateSet(area.cableList ?? [], areaModDefs);
		return { uprateSet, modDefMap: new Map(areaModDefs.map((m) => [m.index, m.def])) };
	}

	it('recovers an explicit colour that differs from the auto default after save/reload', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');

		// Keyboard (type 1): output 0 "Pitch" is blue (index 1), output 1 "Gate" is yellow (index 2).
		const kbd: ModuleInstance = { type: 1, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
		// 2-Out (type 4): destination with plain inputs, no outputs.
		const out: ModuleInstance = { type: 4, index: 2, horiz: 3, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
		mutAddModule(patch, 1, kbd);
		mutAddModule(patch, 1, out);

		// Overridden cable: Pitch (blue/1) forced to red (0) — disagrees with the natural default.
		const overridden: Cable = { colour: 0, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 };
		// Plain cable: Gate (yellow/2) left at its natural default — never touched by the user.
		const plain: Cable = { colour: 2, smod: 1, scon: 1, dir: 1, dmod: 2, dcon: 1 };
		mutAddCable(patch, 1, overridden);
		mutAddCable(patch, 1, plain);

		const savedRawHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: reloaded } = simulateFileSaveAndLoad(name, savedRawHex);

		const { uprateSet, modDefMap } = uprateContext(reloaded, 1);
		const inferred = inferUserColours(reloaded.areas[1].cableList ?? [], uprateSet, modDefMap);

		const overriddenAfter = inferred.find((c) => c.scon === 0)!;
		const plainAfter = inferred.find((c) => c.scon === 1)!;
		expect(overriddenAfter.userColour).toBe(0);
		expect(plainAfter.userColour).toBeUndefined();
	});

	it('does not pin a colour that happens to equal the natural default (documented limitation)', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');
		const kbd: ModuleInstance = { type: 1, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
		const out: ModuleInstance = { type: 4, index: 2, horiz: 3, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
		mutAddModule(patch, 1, kbd);
		mutAddModule(patch, 1, out);

		// "User picks" blue for Pitch — same as the natural default, so it's indistinguishable from unset.
		const indistinguishable: Cable = { colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 };
		mutAddCable(patch, 1, indistinguishable);

		const savedRawHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: reloaded } = simulateFileSaveAndLoad(name, savedRawHex);

		const { uprateSet, modDefMap } = uprateContext(reloaded, 1);
		const inferred = inferUserColours(reloaded.areas[1].cableList ?? [], uprateSet, modDefMap);
		expect(inferred[0].userColour).toBeUndefined();
	});
});

describe('chained edits round-trip', () => {
	it('add module, add cable, move module, delete cable — patch object matches re-parse', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const ids = patch.areas[1].modules.map((m) => m.index);
		const newModId = Math.max(...ids) + 1;

		// 1. Add a Keyboard module (type 1, no params)
		const newMod: ModuleInstance = {
			type: 1,
			index: newModId,
			horiz: 10,
			vert: 10,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patch, 1, newMod);

		// 2. Add a cable from the new module (output 0) to module index 1 (input 0)
		const newCable: Cable = {
			colour: 1,
			smod: newModId,
			scon: 0,
			dir: 1,
			dmod: 1,
			dcon: 0,
		};
		mutAddCable(patch, 1, newCable);

		// 3. Move an existing module
		const existingMod = patch.areas[1].modules.find((m) => m.index === 2)!;
		const movedCol = existingMod.horiz + 1;
		const movedRow = existingMod.vert + 1;
		mutMoveModule(patch, 1, 2, movedCol, movedRow);

		// 4. Delete the first cable (before our additions)
		const firstCable = (patch.areas[1].cableList ?? []).find((c) => c.smod !== newModId && c.dmod !== newModId)!;
		mutDeleteCable(patch, 1, firstCable);

		// Snapshot of patch state before serialization
		const modulesBeforeSerialize = patch.areas[1].modules.map(modSnap).sort((a, b) => a.index - b.index);
		const cablesBeforeSerialize = (patch.areas[1].cableList ?? []).map(cableSnap);

		// Serialize → re-parse
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const modulesAfterParse = patchB.areas[1].modules.map(modSnap).sort((a, b) => a.index - b.index);
		const cablesAfterParse = (patchB.areas[1].cableList ?? []).map(cableSnap);

		expect(modulesAfterParse).toEqual(modulesBeforeSerialize);
		expect(cablesAfterParse).toEqual(cablesBeforeSerialize);
	});
});

describe('paramLabels round-trip', () => {
	it('preserves user-set labels parsed from a fixture', () => {
		// Find a fixture that actually has labels for a useful comparison
		const fixtures = ['Basics  NL2.pch2', 'DXBass FM4.pch2', 'Analogue NL2.pch2'];
		const fixture = fixtures.find((f) => {
			const { patch } = loadFixture(f);
			return patch.areas.some((a) => a.modules.some((m) => m.paramLabels && m.paramLabels.length > 0));
		});
		expect(fixture).toBeDefined();

		const { name, rawHex, patch: patchA } = loadFixture(fixture!);
		const newHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));
		const patchB = parsePatchFromRawHex(name, newHex);

		for (const i of [0, 1] as const) {
			const labeledA = patchA.areas[i].modules.filter((m) => m.paramLabels && m.paramLabels.length > 0);
			const labeledB = patchB.areas[i].modules.filter((m) => m.paramLabels && m.paramLabels.length > 0);
			expect(labeledB.map((m) => m.index).sort()).toEqual(labeledA.map((m) => m.index).sort());
			for (const ma of labeledA) {
				const mb = labeledB.find((m) => m.index === ma.index)!;
				expect(mb.paramLabels).toEqual(ma.paramLabels);
			}
		}
	});

	it('preserves manually-added labels through round-trip', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');

		const labels: ParamLabel[] = [
			{ paramIndex: 0, isString: true, paramLen: 1 + 7 * 3, labels: ['Sine', 'Square', 'Saw'] },
			{ paramIndex: 2, isString: true, paramLen: 1 + 7 * 2, labels: ['On', 'Off'] },
		];

		const mod: ModuleInstance = {
			type: 1,
			index: 1,
			horiz: 0,
			vert: 0,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
			paramLabels: labels,
		};
		mutAddModule(patch, 1, mod);

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const added = patchB.areas[1].modules.find((m) => m.index === 1);
		expect(added).toBeDefined();
		expect(added!.paramLabels).toEqual(labels);
	});

	it('writes an empty 0x5b chunk when no module has labels', () => {
		// EmptyPatch starts with no labels; round-trip should not introduce any
		const { name, rawHex, patch: patchA } = loadFixture('EmptyPatch.pch2');
		const newHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));
		const patchB = parsePatchFromRawHex(name, newHex);

		for (const i of [0, 1] as const) {
			expect(patchB.areas[i].modules.every((m) => !m.paramLabels)).toBe(true);
		}
	});
});

describe('SeqNote pianoRollView round-trip', () => {
	// Mixturtrautonium.pch2 ships two real SeqNote (type 121) instances whose $PARAM_NAMES entries
	// were never touched from their hardware-widget defaults (zoom=1, octaveOffset=5) — confirms the
	// parser decodes real hardware-saved data, not just synthetic test data.
	it('decodes the real fixture default view for both SeqNote instances', () => {
		const { patch } = loadFixture('Mixturtrautonium.pch2');
		const seqNotes = patch.areas[1].modules.filter((m) => m.type === 121);
		expect(seqNotes.length).toBe(2);
		for (const m of seqNotes) {
			expect(m.pianoRollView).toEqual({ zoom: 1, octaveOffset: 5 });
		}
	});

	it('round-trips a changed view and leaves other modules unaffected', () => {
		const { name, rawHex, patch: patchA } = loadFixture('Mixturtrautonium.pch2');
		const seqNote = patchA.areas[1].modules.find((m) => m.type === 121)!;
		mutSetPianoRollView(patchA, 1, seqNote.index, { zoom: 2, octaveOffset: 2 });

		const newHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));
		const patchB = parsePatchFromRawHex(name, newHex);

		const changed = patchB.areas[1].modules.find((m) => m.index === seqNote.index)!;
		expect(changed.pianoRollView).toEqual({ zoom: 2, octaveOffset: 2 });

		const other = patchB.areas[1].modules.find((m) => m.type === 121 && m.index !== seqNote.index)!;
		expect(other.pianoRollView).toEqual({ zoom: 1, octaveOffset: 5 });
	});

	it('defaults a freshly-added SeqNote module to zoom=1/octaveOffset=5 and round-trips it', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');
		const seqNoteDef = getModule(121)!;
		const mod: ModuleInstance = {
			type: 121,
			index: 1,
			horiz: 0,
			vert: 0,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: seqNoteDef.params?.length ?? 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patch, 1, mod);

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		const added = patchB.areas[1].modules.find((m) => m.index === 1);
		expect(added?.pianoRollView).toEqual({ zoom: 1, octaveOffset: 5 });
	});
});

describe('morphParamLabels round-trip', () => {
	// EmptyPatch.pch2 ships with a real $PARAM_NAMES(areaIdx=2) section holding the hardware's
	// own default Morph Group labels — confirms the parser reads real morph-label data, not
	// just synthetic test data.
	const DEFAULT_MORPH_LABELS: ParamLabel[] = ['Wheel', 'Vel', 'Keyb', 'Aft.Tch', 'Sust.Pd', 'Ctrl.Pd', 'P.Stick', 'G.Wh 2'].map((label, i) => ({
		paramIndex: 8 + i,
		isString: true,
		paramLen: 8,
		labels: [label],
	}));

	it('parses the default morph labels already present in a real fixture', () => {
		const { patch } = loadFixture('EmptyPatch.pch2');
		expect(patch.morphParamLabels).toEqual(DEFAULT_MORPH_LABELS);
	});

	it('preserves a renamed morph group label through round-trip', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');

		patch.morphParamLabels = DEFAULT_MORPH_LABELS.map((e) => (e.paramIndex === 8 ? { ...e, labels: ['Foo'] } : e));

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.morphParamLabels).toEqual(patch.morphParamLabels);
	});

	it('empties the areaIdx=2 $5b chunk once morphParamLabels is cleared', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');
		patch.morphParamLabels = undefined;

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.morphParamLabels).toBeUndefined();
	});
});

describe('file save/load round-trip (simulates App.vue saveSlot → handleFileLoad)', () => {
	for (const file of ['EmptyPatch.pch2', 'Basics  NL2.pch2', 'DXBass FM4.pch2']) {
		it(`unmodified patch — ${file}`, () => {
			const { name, rawHex, patch: patchA } = loadFixture(file);

			// Serialize (as saveSlot does after mutations)
			const savedRawHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));

			// Simulate save then load: prepend name header, strip it back
			const { rawHex: loadedRawHex, patch: patchB } = simulateFileSaveAndLoad(name, savedRawHex);

			// rawHex must survive the file cycle unchanged
			expect(loadedRawHex).toEqual(savedRawHex);

			// Parsed patch must equal original
			expectPatchEqual(patchA, patchB);
		});
	}

	it('cable visibility changes survive file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const desc = patch.description!;

		// Force all visibility flags to known values (opposite of typical defaults)
		desc.red = 0;
		desc.blue = 0;
		desc.yellow = 1;
		desc.orange = 0;
		desc.green = 1;
		desc.purple = 0;
		desc.white = 0;

		const savedRawHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedRawHex);

		expect(patchB.description!.red).toBe(0);
		expect(patchB.description!.blue).toBe(0);
		expect(patchB.description!.yellow).toBe(1);
		expect(patchB.description!.orange).toBe(0);
		expect(patchB.description!.green).toBe(1);
		expect(patchB.description!.purple).toBe(0);
		expect(patchB.description!.white).toBe(0);
	});

	it('variation change survives file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const desc = patch.description!;
		const newVariation = (desc.variation + 3) % 9;
		desc.variation = newVariation;

		const savedRawHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedRawHex);

		expect(patchB.description!.variation).toBe(newVariation);
	});

	it('monopoly and category changes survive file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const desc = patch.description!;
		desc.monopoly = 1;
		desc.category = 7;

		const savedRawHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedRawHex);

		expect(patchB.description!.monopoly).toBe(1);
		expect(patchB.description!.category).toBe(7);
	});

	it('edited patch (add module + cable) — EmptyPatch.pch2', () => {
		const { name, rawHex, patch } = loadFixture('EmptyPatch.pch2');

		const mod: ModuleInstance = {
			type: 1,
			index: 1,
			horiz: 2,
			vert: 3,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patch, 1, mod);

		const mod2: ModuleInstance = {
			type: 1,
			index: 2,
			horiz: 5,
			vert: 3,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patch, 1, mod2);

		const cable: Cable = {
			colour: 1,
			smod: 1,
			scon: 0,
			dir: 1,
			dmod: 2,
			dcon: 0,
		};
		mutAddCable(patch, 1, cable);

		const savedRawHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { rawHex: loadedRawHex, patch: patchB } = simulateFileSaveAndLoad(name, savedRawHex);

		expect(loadedRawHex).toEqual(savedRawHex);
		expect(patchB.areas[1].modules).toHaveLength(2);
		expect(patchB.areas[1].cableList ?? []).toHaveLength(1);
		expectPatchEqual(patch, patchB);
	});
});

describe('patchParams round-trip', () => {
	it('patchVol and activeMuted survive parse → serialize → parse', () => {
		const { name, rawHex, patch: patchA } = loadFixture('Analogue NL2.pch2');
		expect(patchA.patchParams).toBeDefined();
		// Verified from binary: variation 0 patchVol=100, activeMuted=1
		expect(patchA.patchParams![0].patchVol).toBe(100);
		expect(patchA.patchParams![0].activeMuted).toBe(1);

		patchA.patchParams![0].patchVol = 75;
		patchA.patchParams![1].patchVol = 50;
		patchA.patchParams![0].activeMuted = 0;
		const origV2Vol = patchA.patchParams![2].patchVol;

		const newHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.patchParams![0].patchVol).toBe(75);
		expect(patchB.patchParams![1].patchVol).toBe(50);
		expect(patchB.patchParams![0].activeMuted).toBe(0);
		expect(patchB.patchParams![2].patchVol).toBe(origV2Vol);
	});

	it('morph data survives chained serialization', () => {
		// Analogue NL2 has non-zero morphs (dial 7 = 43 at variation 0)
		const { name, rawHex, patch: patchA } = loadFixture('Analogue NL2.pch2');
		patchA.patchParams![0].patchVol = 99;

		const hex1 = serializePatch(name, patchA, rawHex, extractVariations(patchA));
		const patchB = parsePatchFromRawHex(name, hex1);
		expect(patchB.patchParams![0].patchVol).toBe(99);

		// Re-serialize using hex1 as template — morphs now come from hex1
		const hex2 = serializePatch(name, patchB, hex1, extractVariations(patchB));
		const patchC = parsePatchFromRawHex(name, hex2);
		expect(patchC.patchParams![0].patchVol).toBe(99);
		// Identical output means morphs were preserved intact through the chain
		expect(hex2).toBe(hex1);
	});

	it('all PatchParamVariation fields survive round-trip', () => {
		const { name, rawHex, patch: patchA } = loadFixture('DXBass FM4.pch2');
		expect(patchA.patchParams).toBeDefined();
		const snap = { ...patchA.patchParams![0] };

		patchA.patchParams![0].glide = 1;
		patchA.patchParams![0].glideTime = 30;
		patchA.patchParams![0].bend = 0;
		patchA.patchParams![0].arpeggiator = 1;

		const newHex = serializePatch(name, patchA, rawHex, extractVariations(patchA));
		const patchB = parsePatchFromRawHex(name, newHex);
		const r = patchB.patchParams![0];

		expect(r.glide).toBe(1);
		expect(r.glideTime).toBe(30);
		expect(r.bend).toBe(0);
		expect(r.arpeggiator).toBe(1);
		expect(r.patchVol).toBe(snap.patchVol);
		expect(r.activeMuted).toBe(snap.activeMuted);
	});
});

describe('morph assignment round-trip', () => {
	it('assignments (incl. a negative range) survive serialize → parse', () => {
		const { name, rawHex, patch } = loadFixture('Analogue NL2.pch2');
		const assignments = [
			{ groupIndex: 0, location: 0 as const, moduleIndex: 2, paramIndex: 0, range: 40 },
			{ groupIndex: 3, location: 1 as const, moduleIndex: 5, paramIndex: 1, range: -25 },
		];
		patch.patchParams![0].morphAssignments = assignments;

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.patchParams![0].morphAssignments).toEqual(assignments);
	});

	it('assignments survive file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.patchParams![2].morphAssignments = [{ groupIndex: 7, location: 0 as const, moduleIndex: 1, paramIndex: 3, range: 1 }];

		const savedHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedHex);

		expect(patchB.patchParams![2].morphAssignments).toEqual(patch.patchParams![2].morphAssignments);
	});

	it('no morph assignments still produces a (all-default) 0x65 section, not a dropped one', () => {
		// MORPH_PARAMS is a fixed 9-variation structure that's always present on the wire,
		// even with no assignments — dropping it corrupted the section sequence.
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		for (const p of patch.patchParams ?? []) p.morphAssignments = [];

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));

		expect(extractSection(newHex, 0x65)).not.toBeNull();
	});

	it('a real fixture with an existing 0x65 section (Analogue NL2.pch2) parses it and round-trips byte-identically', () => {
		const { name, rawHex, patch } = loadFixture('Analogue NL2.pch2');
		expect(extractSection(rawHex, 0x65)).not.toBeNull();
		expect(patch.patchParams!.some((p) => p.morphAssignments.length > 0)).toBe(true);

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));

		expect(extractSection(newHex, 0x65)).toBe(extractSection(rawHex, 0x65));
	});

	it('assignment removed when deassigned', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.patchParams![0].morphAssignments = [{ groupIndex: 1, location: 1 as const, moduleIndex: 3, paramIndex: 0, range: 10 }];

		const hexWith = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchWith = parsePatchFromRawHex(name, hexWith);
		expect(patchWith.patchParams![0].morphAssignments).toHaveLength(1);

		patchWith.patchParams![0].morphAssignments = [];
		const hexWithout = serializePatch(name, patchWith, hexWith, extractVariations(patchWith));
		const patchWithout = parsePatchFromRawHex(name, hexWithout);
		expect(patchWithout.patchParams![0].morphAssignments ?? []).toHaveLength(0);
	});
});

// ── prf2 helpers ──────────────────────────────────────────────────────────────

function loadFixturePrf2(filename: string): {
	name: string;
	rawHex: string;
	slotNames: string[];
	patches: Patch[];
	globalParamPages: GlobalParamPageAssignment[];
} {
	const buf = fs.readFileSync(path.join(FIXTURES, filename));
	const fileBytes = new Uint8Array(buf);
	let ofs = 0;
	while (ofs < fileBytes.length && fileBytes[ofs] !== 0) ofs++;
	const name = new TextDecoder().decode(fileBytes.slice(0, ofs));
	const rawHex = Array.from(fileBytes.slice(ofs + 3))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const parsed = new PatchParser(fileBytes.buffer).parsePrf2()!;
	return { name, rawHex, slotNames: parsed.slotNames, patches: parsed.patches, globalParamPages: parsed.globalParamPages };
}

function parsePerfFromRawHex(name: string, rawHex: string): { slotNames: string[]; patches: Patch[]; globalParamPages: GlobalParamPageAssignment[] } {
	const sectionBytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const nameBytes = new TextEncoder().encode(name);
	const prf2 = new Uint8Array(nameBytes.length + 3 + sectionBytes.length);
	prf2.set(nameBytes);
	prf2[nameBytes.length] = 0x00;
	prf2[nameBytes.length + 1] = 0x17;
	prf2[nameBytes.length + 2] = 0x00;
	prf2.set(sectionBytes, nameBytes.length + 3);
	return new PatchParser(prf2.buffer).parsePrf2()!;
}

function simulatePerfFileSaveAndLoad(name: string, rawHex: string): { rawHex: string; patches: Patch[] } {
	const sectionBytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const nameBytes = new TextEncoder().encode(name);
	const fileBytes = new Uint8Array(nameBytes.length + 3 + sectionBytes.length);
	fileBytes.set(nameBytes);
	fileBytes[nameBytes.length] = 0x00;
	fileBytes[nameBytes.length + 1] = 0x17;
	fileBytes[nameBytes.length + 2] = 0x00;
	fileBytes.set(sectionBytes, nameBytes.length + 3);
	let nameEnd = 0;
	while (nameEnd < fileBytes.length && fileBytes[nameEnd] !== 0) nameEnd++;
	const loadedRawHex = Array.from(fileBytes.slice(nameEnd + 3))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const parsed = new PatchParser(fileBytes.buffer).parsePrf2()!;
	return { rawHex: loadedRawHex, patches: parsed.patches };
}

// Splits a prf2 section stream (trailing CRC excluded) into blocks at each slot separator,
// so slot N's sections can be compared independently: [0x11 settings], slot 0..3 (each
// ending in its own 0x6f), then the trailing 0x5f. Section types only — sizes are compared
// elsewhere; here we only care that nothing is dropped or duplicated.
function sectionBlocks(rawHex: string): number[][] {
	const bytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const dataLen = bytes.length - 2;
	const blocks: number[][] = [[]];
	let ofs = 0;
	while (ofs < dataLen) {
		const type = bytes[ofs];
		blocks[blocks.length - 1].push(type);
		if (type === SectionType.SEPARATOR) blocks.push([]);
		ofs += 3 + ((bytes[ofs + 1] << 8) | bytes[ofs + 2]);
	}
	return blocks;
}

function extractSection(rawHex: string, targetType: number): string | null {
	const bytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	let ofs = 0;
	while (ofs < bytes.length - 2) {
		const type = bytes[ofs];
		const siz = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
		if (type === targetType) {
			return Array.from(bytes.slice(ofs, ofs + 3 + siz))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
		}
		ofs += 3 + siz;
	}
	return null;
}

// Removes every section of a given type from rawHex, keeping the trailing CRC bytes as-is
// (their validity doesn't matter — serializePatch never checks the template's own CRC).
function removeSection(rawHex: string, targetType: number): string {
	const bytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const out: number[] = [];
	let ofs = 0;
	while (ofs < bytes.length - 2) {
		const type = bytes[ofs];
		const siz = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
		if (type !== targetType) out.push(...bytes.slice(ofs, ofs + 3 + siz));
		ofs += 3 + siz;
	}
	out.push(...bytes.slice(bytes.length - 2));
	return out.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── prf2 tests ────────────────────────────────────────────────────────────────

describe('prf2 round-trip: parse → serializePerformance → parse', () => {
	for (const file of ['EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
		it(file, () => {
			const { name, rawHex, patches: patchesA } = loadFixturePrf2(file);
			const newHex = serializePerformance(patchesA, rawHex, patchesA.map(extractVariations));
			const { patches: patchesB } = parsePerfFromRawHex(name, newHex);
			expect(patchesB).toHaveLength(4);
			for (let s = 0; s < 4; s++) {
				expectPatchEqual(patchesA[s], patchesB[s]);
			}
		});
	}
});

// The C_MORPH_PARAM ($65) chunk is bit-packed and the G2 checks its byte length against what the
// declared counts imply. Layout, per G2Editor.c CMorphMapData_11::WriteStream:
//   header      = 8 (variationCount) + 4 (morphCount) + 8x2 (morph modes)          = 28 bits
//   variation   = 8 (index) + 8x7 (reserved) + 8 (assignment count)                = 72 bits
//   assignment  = 2 (location) + 8 (module) + 7 (param) + 4 (group) + 8 (range)    = 29 bits
// An earlier writer used a 20-bit header reserve plus a 4-bit filler after each variation. Those
// cancel at every field the parser reads, so round-trips stayed self-consistent — but the chunk
// ended 4 bits long, and whenever that crossed a byte boundary the G2 rejected the entire patch
// with {"type":"error","code":3} and renamed it "Error". Confirmed on hardware: 36 assignments
// over 9 variations is exactly such a case (1720 bits = 215 B; the old writer emitted 216 B).
describe('C_MORPH_PARAM ($65) chunk length (regression: G2 rejects the patch with code 3)', () => {
	const MORPH_BITS = (assignments: number) => 28 + 9 * 72 + 29 * assignments;

	for (const perVariation of [0, 1, 4, 7]) {
		it(`${perVariation} morph assignments per variation packs to the exact byte length`, () => {
			const { rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
			const patch = patches[0];
			for (const v of patch.patchParams ?? []) {
				v.morphAssignments = Array.from({ length: perVariation }, (_, i) => ({
					groupIndex: 1,
					location: 1 as const,
					moduleIndex: 7 + i,
					paramIndex: 4,
					range: 127,
				}));
			}
			const hex = serializePerformance(patches, rawHex, patches.map(extractVariations));
			const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
			let ofs = 0;
			let found = -1;
			while (ofs < bytes.length - 2) {
				const siz = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
				if (bytes[ofs] === 0x65) {
					found = siz;
					break;
				}
				ofs += 3 + siz;
			}
			expect(found).toBe(Math.ceil(MORPH_BITS(perVariation * 9) / 8));
		});
	}

	it('writes assignments whose range is 0 instead of dropping them', () => {
		// Genuine files carry these: every one of computer blibs.pch2's 27 morph assignments has
		// range 0, and a `filter(a => a.range !== 0)` in the writer collapsed its $65 from 183
		// bytes to the 85-byte empty form — the whole morph configuration lost on save. The
		// reference reader AddMorph()s every entry without inspecting the range.
		const { rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const patch = patches[0];
		for (const v of patch.patchParams ?? []) {
			v.morphAssignments = [
				{ groupIndex: 1, location: 1 as const, moduleIndex: 7, paramIndex: 4, range: 0 },
				{ groupIndex: 2, location: 1 as const, moduleIndex: 8, paramIndex: 5, range: 0 },
			];
		}
		const hex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
		let ofs = 0;
		let found = -1;
		while (ofs < bytes.length - 2) {
			const siz = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
			if (bytes[ofs] === 0x65) {
				found = siz;
				break;
			}
			ofs += 3 + siz;
		}
		expect(found).toBe(Math.ceil(MORPH_BITS(2 * 9) / 8));
	});

	it('preserves the per-morph keyboard-assign values through a round-trip', () => {
		// 2 bits per morph group in the $65 header. Always zero in all 4055 reference patches and
		// in a live device capture, so nothing reads it yet — but the writer used to hardcode
		// zeros, which would silently destroy it the moment a patch did use it.
		const { rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		patches[0].morphKeyboardAssign = [0, 1, 2, 0, 2, 1, 0, 1];
		const hex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const reparsed = parsePerfFromRawHex('x', hex);
		expect(reparsed.patches[0].morphKeyboardAssign).toEqual([0, 1, 2, 0, 2, 1, 0, 1]);
	});
});

describe('prf2 whole-message structure preservation (regression: wire-upload hang)', () => {
	// A real G2 hung when downloading a performance re-serialized from an unedited .prf2 —
	// serializePerformance treated the trailing C_KNOBS_GLOBAL section as a 5th slot, resetting
	// its "already written" tracking and causing the post-loop catch-up to re-emit a slot's
	// CONTROLLERS/morph-PARAM_NAMES a second time *instead of* the required C_KNOBS_GLOBAL
	// terminator. Section-by-section patch equality (the describe block above) doesn't catch
	// this since it never looks past the last parsed patch, so assert on the raw structure too.
	for (const file of ['EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
		it(`${file}: unmodified round-trip ends in a single, correctly-aligned C_KNOBS_GLOBAL section`, () => {
			const { rawHex, patches } = loadFixturePrf2(file);
			const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));

			const bytes = new Uint8Array(newHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
			const dataLen = bytes.length - 2;
			let ofs = 0;
			let lastType = -1;
			while (ofs < dataLen) {
				lastType = bytes[ofs];
				const siz = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
				ofs += 3 + siz;
			}
			expect(ofs).toBe(dataLen); // no partial/misaligned trailing bytes
			expect(lastType).toBe(0x5f); // C_KNOBS_GLOBAL
		});
	}

	// The check above passes even when whole sections go missing, which is what actually
	// broke Performance → Download: writeParamNames/writeModuleNames returned null for an
	// area with no labels/names and the caller dropped the section, leaving the 4-patch
	// stream 20 bytes short per slot. The G2 reads the four patch chunk trains back to
	// back, so a missing chunk desyncs it for everything that follows.
	//
	// Section ORDER matters, not just presence — confirmed on real hardware. An earlier version
	// emitted C_PARAM_NAMES eagerly right after its C_PARAM_LIST trigger, interleaving a 0x5b
	// between the three consecutive 0x4d sections; the G2 rejected that performance with
	// {"type":"error","slot":"A","code":3} and renamed the performance "Error". With the order
	// restored it loads correctly. So compare the ordered section-id train per slot.
	// Sizes matter too, not just the id train. writeModuleNames used to filter its entries to
	// `uname && uname.length > 0`, but a .prf2 carries an entry for every module that HAS a label
	// record — including one whose label is the empty string (29 of 80 entries in one slot of a
	// genuine Clavia performance). Dropping those shrank every 0x5a and cost a real file 214
	// bytes on an unmodified round-trip. Delphi's TModuleLabelList.Write emits its whole list
	// unfiltered for the same reason. An unmodified round-trip must therefore preserve each
	// section's payload length exactly.
	for (const file of ['EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
		it(`${file}: unmodified round-trip preserves every name/morph section's payload length`, () => {
			const { rawHex, patches } = loadFixturePrf2(file);
			const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));

			// Scoped to the name sections (0x5a/0x5b). Two of MorphingDrumDemo's 0x4d sections
			// re-serialize 8 bytes larger — a separate, pre-existing encoding difference that the
			// semantic round-trip tests above pass over, not part of this regression.
			const sizes = (hex: string): string[] => {
				const b = new Uint8Array(hex.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
				const out: string[] = [];
				for (let ofs = 0; ofs < b.length - 2; ) {
					const siz = (b[ofs + 1] << 8) | b[ofs + 2];
					if (b[ofs] === 0x5a || b[ofs] === 0x5b || b[ofs] === 0x65) out.push(`${b[ofs].toString(16)}:${siz}`);
					ofs += 3 + siz;
				}
				return out;
			};
			expect(sizes(newHex)).toEqual(sizes(rawHex));
		});
	}

	for (const file of ['EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
		it(`${file}: unmodified round-trip preserves the ordered section train of every slot`, () => {
			const { rawHex, patches } = loadFixturePrf2(file);
			const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));

			const origBlocks = sectionBlocks(rawHex);
			const newBlocks = sectionBlocks(newHex);

			// 0x11 perf settings + 4 slots (each terminated by 0x6f) + the trailing 0x5f block
			expect(origBlocks).toHaveLength(5);
			expect(newBlocks).toHaveLength(5);

			for (let i = 0; i < origBlocks.length; i++) {
				expect(newBlocks[i]).toEqual(origBlocks[i]);
			}

			// The fixed per-slot chunk train all three reference implementations agree on.
			// Block 0 is preceded by the performance's own 0x11 settings section.
			for (let slot = 0; slot < 4; slot++) {
				const block = slot === 0 ? newBlocks[0].slice(1) : newBlocks[slot];
				if (slot === 0) expect(newBlocks[0][0]).toBe(SectionType.PERF_DATA);
				expect(block.map((t) => t.toString(16)).join(' ')).toBe('21 4a 4a 69 52 52 4d 4d 4d 65 62 60 5b 5b 5b 5a 5a 6f');
			}
		});
	}
});

describe('prf2 per-slot CONTROLLERS ($60) are not shared between slots', () => {
	// The parser kept a single controllersData list, so parsing a .prf2 left every slot holding
	// whichever slot was parsed last, and re-serializing then wrote that one into all four —
	// silently replacing three slots' MIDI-CC assignments on Performance → Download. A
	// round-trip test can't see this (both sides share the same collapsed list), so assert
	// against the fixture's own ground truth instead.
	it('MorphingDrumDemo.prf2: slot A has its own 13 assignments, slots B–D have 14', () => {
		const { patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		expect(patches.map((p) => p.controllers?.length ?? 0)).toEqual([13, 14, 14, 14]);
		// Slot B carries a CC 4 assignment (location 0, module 8) that slot A does not.
		expect(patches[1].controllers).toEqual(expect.arrayContaining([{ cc: 4, location: 0, moduleIndex: 8, paramIndex: 0 }]));
		expect(patches[0].controllers).not.toEqual(expect.arrayContaining([{ cc: 4, location: 0, moduleIndex: 8, paramIndex: 0 }]));
	});

	it('MorphingDrumDemo.prf2: each slot re-serializes with its own $60 section', () => {
		const { rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const sizes = (hex: string) => {
			const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
			const out: number[] = [];
			let ofs = 0;
			while (ofs < bytes.length - 2) {
				const siz = (bytes[ofs + 1] << 8) | bytes[ofs + 2];
				if (bytes[ofs] === SectionType.CONTROLLERS) out.push(siz);
				ofs += 3 + siz;
			}
			return out;
		};
		// Slot A's shorter section survives instead of being overwritten by another slot's.
		expect(sizes(newHex)).toEqual(sizes(rawHex));
	});
});

describe('prf2 0x11 section preservation', () => {
	it('perf data header (0x11) is byte-identical after round-trip', () => {
		const { rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const orig11 = extractSection(rawHex, 0x11);
		const new11 = extractSection(newHex, 0x11);
		expect(orig11).not.toBeNull();
		expect(new11).toBe(orig11);
	});

	it('header knob source, range enable, bpm and clock run are parsed', () => {
		const buf = fs.readFileSync(path.join(FIXTURES, 'MorphingDrumDemo.prf2'));
		const prf2 = new PatchParser(new Uint8Array(buf).buffer).parsePrf2()!;
		expect(prf2.settings).toEqual({ focus: 0, knobSourceGlobal: false, rangeEnable: false, bpm: 120, clockRunning: true });
	});

	it('header knob source Global is parsed', () => {
		const buf = fs.readFileSync(path.join(FIXTURES, 'banks-test/New Performance.prf2'));
		const prf2 = new PatchParser(new Uint8Array(buf).buffer).parsePrf2()!;
		expect(prf2.settings).toEqual({ focus: 0, knobSourceGlobal: true, rangeEnable: false, bpm: 152, clockRunning: true });
	});

	it('focus comes from the header, not the first keyed slot (A and D keyed, D focused)', () => {
		const buf = fs.readFileSync(path.join(FIXTURES, 'banks-test/OT Template 7.5..prf2'));
		const prf2 = new PatchParser(new Uint8Array(buf).buffer).parsePrf2()!;
		expect(prf2.slotMeta.map((m) => m.key)).toEqual([true, false, false, true]);
		expect(prf2.settings.focus).toBe(3);
	});
});

describe('prf2 per-slot mutation round-trip', () => {
	it('mutating slot 0 does not affect slots 1–3', () => {
		const { name, rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const snapsBefore = [1, 2, 3].map((s) => ({
			mods: patches[s].areas[1].modules.map(modSnap).sort((a, b) => a.index - b.index),
			cabs: (patches[s].areas[1].cableList ?? []).map(cableSnap),
		}));

		const mod: ModuleInstance = {
			type: 1,
			index: 200,
			horiz: 1,
			vert: 1,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patches[0], 1, mod);

		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const { patches: reparsed } = parsePerfFromRawHex(name, newHex);

		for (let s = 1; s <= 3; s++) {
			const mods = reparsed[s].areas[1].modules.map(modSnap).sort((a, b) => a.index - b.index);
			const cabs = (reparsed[s].areas[1].cableList ?? []).map(cableSnap);
			expect(mods).toEqual(snapsBefore[s - 1].mods);
			expect(cabs).toEqual(snapsBefore[s - 1].cabs);
		}

		const slot0mods = reparsed[0].areas[1].modules.map(modSnap).sort((a, b) => a.index - b.index);
		expect(slot0mods.some((m) => m.index === 200)).toBe(true);
	});

	it('mutating slot 2 survives round-trip', () => {
		const { name, rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const mod: ModuleInstance = {
			type: 1,
			index: 201,
			horiz: 2,
			vert: 3,
			colour: 0,
			uprate: 0,
			mutaLock: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patches[2], 1, mod);

		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const { patches: reparsed } = parsePerfFromRawHex(name, newHex);

		const found = reparsed[2].areas[1].modules.find((m) => m.index === 201);
		expect(found).toBeDefined();
		expect(found!.horiz).toBe(2);
		expect(found!.vert).toBe(3);
	});
});

describe('trailing CRC matches the file-type byte actually written', () => {
	// The CRC covers [0x17][fileType][sectionBytes]. buildRawHex used to hardcode fileType 0x00,
	// so every .prf2 we wrote (header byte 0x01) carried a CRC that didn't validate against its
	// own header. Verified against genuine Clavia files, whose CRCs do validate over this range.
	function crc16(bytes: Uint8Array): number {
		let r = 0;
		for (const x of bytes) {
			r ^= x << 8;
			for (let i = 0; i < 8; i++) r = r & 0x8000 ? ((r << 1) ^ 0x1021) & 0xffff : (r << 1) & 0xffff;
		}
		return r;
	}
	// Rebuilds the on-disk image the way saveSlot/savePerformance do, then validates the CRC.
	function expectCrcValid(rawHex: string, fileType: number) {
		const sections = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
		const body = sections.slice(0, sections.length - 2);
		const stored = (sections[sections.length - 2] << 8) | sections[sections.length - 1];
		const forCrc = new Uint8Array(2 + body.length);
		forCrc[0] = 0x17;
		forCrc[1] = fileType;
		forCrc.set(body, 2);
		expect(crc16(forCrc)).toBe(stored);
	}

	for (const file of ['EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
		it(`${file}: performance CRC covers file type 0x01`, () => {
			const { rawHex, patches } = loadFixturePrf2(file);
			expectCrcValid(serializePerformance(patches, rawHex, patches.map(extractVariations)), 0x01);
		});
	}

	for (const file of ['EmptyPatch.pch2', 'Clavia demo.pch2']) {
		it(`${file}: patch CRC covers file type 0x00`, () => {
			const { name, rawHex, patch } = loadFixture(file);
			expectCrcValid(serializePatch(name, patch, rawHex, extractVariations(patch)), 0x00);
		});
	}
});

describe('prf2 file save/load round-trip', () => {
	for (const file of ['EmptyPerf.prf2', 'MorphingDrumDemo.prf2']) {
		it(`unmodified — ${file}`, () => {
			const { name, rawHex, patches: patchesA } = loadFixturePrf2(file);
			const savedRawHex = serializePerformance(patchesA, rawHex, patchesA.map(extractVariations));
			const { rawHex: loadedRawHex, patches: patchesB } = simulatePerfFileSaveAndLoad(name, savedRawHex);
			expect(loadedRawHex).toEqual(savedRawHex);
			for (let s = 0; s < 4; s++) {
				expectPatchEqual(patchesA[s], patchesB[s]);
			}
		});
	}
});

describe('MidiCC round-trip: assign → serialize → parse', () => {
	it('controllers survive serialize → parse', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const assignments = [
			{ cc: 74, location: 1 as const, moduleIndex: 2, paramIndex: 0 },
			{ cc: 10, location: 0 as const, moduleIndex: 5, paramIndex: 1 },
		];
		patch.controllers = assignments;

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.controllers).toEqual(assignments);
	});

	it('controllers survive file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.controllers = [{ cc: 33, location: 1 as const, moduleIndex: 1, paramIndex: 2 }];

		const savedHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedHex);

		expect(patchB.controllers).toEqual(patch.controllers);
	});

	it('empty controllers still produces a (zero-count) 0x60 section, not a dropped one', () => {
		// The wire format always carries a CONTROLLERS section — dropping it entirely when
		// empty (rather than writing a valid zero-count one) previously corrupted the
		// section sequence for any patch/performance with no MIDI-CC assignments.
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.controllers = [];

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));

		expect(extractSection(newHex, 0x60)).not.toBeNull();
	});

	it('controllers removed when deassigned', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.controllers = [{ cc: 20, location: 1 as const, moduleIndex: 3, paramIndex: 0 }];

		const hexWith = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchWith = parsePatchFromRawHex(name, hexWith);
		expect(patchWith.controllers).toHaveLength(1);

		patchWith.controllers = [];
		const hexWithout = serializePatch(name, patchWith, hexWith, extractVariations(patchWith));
		const patchWithout = parsePatchFromRawHex(name, hexWithout);
		expect(patchWithout.controllers ?? []).toHaveLength(0);
	});
});

describe('Parameter Pages round-trip: assign → serialize → parse', () => {
	it('parses a Morph Group knob as location=2 on the PATCH_MORPH pseudo-module', () => {
		// RndKit.pch2: Morph Group 5 on Page A1 Knob 8, Morph Group 8 on slot 50
		const { name, rawHex, patch } = loadFixture('eigen/RndKit.pch2');
		const morphKnobs = patch.paramPages?.filter((a) => a.location === 2);
		expect(morphKnobs).toEqual([
			{ slotIndex: 7, location: 2, moduleIndex: PATCH_MORPH_MODULE_ID, paramIndex: 4, isLed: 0 },
			{ slotIndex: 50, location: 2, moduleIndex: PATCH_MORPH_MODULE_ID, paramIndex: 7, isLed: 0 },
		]);
		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		expect(parsePatchFromRawHex(name, newHex).paramPages).toEqual(patch.paramPages);
	});

	it('paramPages survive serialize → parse', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const assignments = [
			{ slotIndex: 0, location: 1 as const, moduleIndex: 2, paramIndex: 0, isLed: 0 },
			{ slotIndex: 42, location: 0 as const, moduleIndex: 5, paramIndex: 1, isLed: 0 },
			{ slotIndex: 119, location: 1 as const, moduleIndex: 1, paramIndex: 3, isLed: 0 },
		];
		patch.paramPages = assignments;

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.paramPages).toEqual(assignments);
	});

	it('paramPages survive file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.paramPages = [{ slotIndex: 8, location: 1 as const, moduleIndex: 1, paramIndex: 2, isLed: 0 }];

		const savedHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedHex);

		expect(patchB.paramPages).toEqual(patch.paramPages);
	});

	it('empty paramPages still produces a (all-empty) 0x62 section, not a dropped one', () => {
		// Same reasoning as the CONTROLLERS case above: KNOBS is a fixed-size 120-slot bitmap
		// that's always present on the wire, even when nothing is assigned.
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.paramPages = [];

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));

		expect(extractSection(newHex, 0x62)).not.toBeNull();
	});

	it('paramPages removed when deassigned', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.paramPages = [{ slotIndex: 16, location: 1 as const, moduleIndex: 3, paramIndex: 0, isLed: 0 }];

		const hexWith = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchWith = parsePatchFromRawHex(name, hexWith);
		expect(patchWith.paramPages).toHaveLength(1);

		patchWith.paramPages = [];
		const hexWithout = serializePatch(name, patchWith, hexWith, extractVariations(patchWith));
		const patchWithout = parsePatchFromRawHex(name, hexWithout);
		expect(patchWithout.paramPages ?? []).toHaveLength(0);
	});
});

describe('Global Parameter Pages round-trip: assign → serializePerformance → parse', () => {
	it('globalParamPages survive serialize → parse', () => {
		const { name, rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const assignments: GlobalParamPageAssignment[] = [
			{ slotIndex: 0, slot: 'A', location: 1, moduleIndex: 2, paramIndex: 0, isLed: 0 },
			{ slotIndex: 42, slot: 'C', location: 0, moduleIndex: 5, paramIndex: 1, isLed: 0 },
			{ slotIndex: 119, slot: 'D', location: 1, moduleIndex: 1, paramIndex: 3, isLed: 0 },
		];

		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations), assignments);
		const { globalParamPages: reparsed } = parsePerfFromRawHex(name, newHex);

		expect(reparsed).toEqual(assignments);
	});

	it('globalParamPages survive file save/load cycle', () => {
		const { name, rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const assignments: GlobalParamPageAssignment[] = [{ slotIndex: 8, slot: 'B', location: 1, moduleIndex: 1, paramIndex: 2, isLed: 0 }];

		const savedHex = serializePerformance(patches, rawHex, patches.map(extractVariations), assignments);
		const { patches: patchesB } = simulatePerfFileSaveAndLoad(name, savedHex);
		// simulatePerfFileSaveAndLoad discards globalParamPages (returns only {rawHex, patches}) —
		// reparse the saved bytes directly instead, same round-trip the store's save/load actually
		// performs (loadPerformanceFile/savePerformance in slots.ts).
		expect(patchesB).toHaveLength(4);
		const { globalParamPages: reparsed } = parsePerfFromRawHex(name, savedHex);
		expect(reparsed).toEqual(assignments);
	});

	it('empty globalParamPages still produces a (all-empty) 0x5f section, not a dropped one', () => {
		// C_KNOBS_GLOBAL is the wire format's final, terminating section for a whole-performance
		// upload — dropping it when empty left the message without its required terminator.
		const { rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations), []);
		expect(extractSection(newHex, 0x5f)).not.toBeNull();
	});

	it('globalParamPages removed when deassigned', () => {
		const { name, rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const assignments: GlobalParamPageAssignment[] = [{ slotIndex: 16, slot: 'D', location: 1, moduleIndex: 3, paramIndex: 0, isLed: 0 }];

		const hexWith = serializePerformance(patches, rawHex, patches.map(extractVariations), assignments);
		const { globalParamPages: withKnobs } = parsePerfFromRawHex(name, hexWith);
		expect(withKnobs).toHaveLength(1);

		const hexWithout = serializePerformance(patches, hexWith, patches.map(extractVariations), []);
		const { globalParamPages: withoutKnobs } = parsePerfFromRawHex(name, hexWithout);
		expect(withoutKnobs).toHaveLength(0);
	});
});

describe('paramPages slot addressing helpers', () => {
	it('slotIndexFor / slotIndexToBankPageKnob round-trip for all 120 slots', async () => {
		const { slotIndexFor, slotIndexToBankPageKnob, BANK_COUNT, PAGE_COUNT, KNOBS_PER_PAGE, TOTAL_KNOB_SLOTS } = await import('../../renderer/paramPages');
		expect(BANK_COUNT * PAGE_COUNT * KNOBS_PER_PAGE).toBe(TOTAL_KNOB_SLOTS);
		for (let bank = 0; bank < BANK_COUNT; bank++) {
			for (let page = 0; page < PAGE_COUNT; page++) {
				for (let knob = 0; knob < KNOBS_PER_PAGE; knob++) {
					const slotIndex = slotIndexFor(bank, page, knob);
					expect(slotIndex).toBeGreaterThanOrEqual(0);
					expect(slotIndex).toBeLessThan(TOTAL_KNOB_SLOTS);
					expect(slotIndexToBankPageKnob(slotIndex)).toEqual({ bank, page, knob });
				}
			}
		}
	});
});

describe('patch text round-trip: parse → serialize → parse', () => {
	it('text survives serialize → parse, including an embedded newline and Latin-1 chars', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.text = 'Line one\nLine two - special chars: äöü';

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.text).toBe(patch.text);
	});

	it('replaces characters outside Latin-1 with ? instead of masking them into unrelated bytes', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.text = 'a\u0141b\u20acc';

		const patchB = parsePatchFromRawHex(name, serializePatch(name, patch, rawHex, extractVariations(patch)));

		expect(patchB.text).toBe('a?b?c');
	});

	it('text survives file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.text = 'Some patch notes';

		const savedHex = serializePatch(name, patch, rawHex, extractVariations(patch));
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedHex);

		expect(patchB.text).toBe(patch.text);
	});

	it('empty text still produces a zero-length 0x6f section (not omitted)', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		patch.text = '';

		const newHex = serializePatch(name, patch, rawHex, extractVariations(patch));

		expect(extractSection(newHex, 0x6f)).toBe('6f0000');
	});

	it('adds a text-pad section when the template has none (hardware get-patch case)', () => {
		// The main hardware get-patch response never includes a 0x6f section — notes are
		// fetched separately and merged only into patch.text. Simulate that template shape.
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const templateNoText = removeSection(rawHex, 0x6f);
		expect(extractSection(templateNoText, 0x6f)).toBeNull();

		patch.text = 'Notes added after loading from hardware';
		const newHex = serializePatch(name, patch, templateNoText, extractVariations(patch));
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.text).toBe(patch.text);
	});

	it('adds no text-pad section when the template has none and text is empty', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const templateNoText = removeSection(rawHex, 0x6f);
		patch.text = '';

		const newHex = serializePatch(name, patch, templateNoText, extractVariations(patch));
		expect(extractSection(newHex, 0x6f)).toBeNull();
	});
});

describe('prf2 patch text per-slot mutation round-trip', () => {
	it('mutating slot 0 text does not affect slots 1–3', () => {
		const { name, rawHex, patches } = loadFixturePrf2('MorphingDrumDemo.prf2');
		const before = [1, 2, 3].map((s) => patches[s].text ?? '');

		patches[0].text = 'slot0 notes';

		const newHex = serializePerformance(patches, rawHex, patches.map(extractVariations));
		const { patches: reparsed } = parsePerfFromRawHex(name, newHex);

		expect(reparsed[0].text).toBe('slot0 notes');
		for (let s = 1; s <= 3; s++) {
			expect(reparsed[s].text ?? '').toBe(before[s - 1]);
		}
	});
});

describe('paramNames hardware padding', () => {
	it('ignores padding/garbage after the real entries within a module block', () => {
		// Hardware get-patch for a real patch sent moduleLen=40 but only 3 real entries, followed by
		// zero/garbage bytes where the original editor's file has a 4th. Morph scope (area 2) needs no modules.
		const label = (i: number, s: string) => [1, 8, i, ...Array.from({ length: 7 }, (_, k) => s.charCodeAt(k) || 0)];
		const entries = [...label(8, 'Kick'), ...label(9, 'Snare'), ...label(10, 'HiHat'), 0, 0, 0, 0, 0, 0, 0x3d, 0x3d, 0, 0];
		const bytes = [PATCH_MORPH_MODULE_ID, entries.length, ...entries];
		// 2-bit area (2) + 8-bit module count (1), then the bytes, MSB-first
		let bits = '10' + '00000001' + bytes.map((b) => b.toString(2).padStart(8, '0')).join('');
		bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
		const body = bits.match(/.{8}/g)!.map((b) => parseInt(b, 2));
		const header = Array.from(new TextEncoder().encode('Version=Nord Modular G2 File Format 1\r\n')).concat([0, 0x17, 0]);
		// the parser reads a fixed 320-byte header window, so trail the file with an ignored (unknown-type) section
		const pad = new Array(320).fill(0);
		const file = new Uint8Array([
			...header,
			SectionType.PARAM_NAMES,
			body.length >> 8,
			body.length & 0xff,
			...body,
			0x7f,
			pad.length >> 8,
			pad.length & 0xff,
			...pad,
			0,
			0,
		]);
		const patch = new PatchParser(file.buffer as ArrayBuffer).parse();
		// the zero bytes parse as label-less (paramLen 0) entries, as in normal files; the 0x3d garbage is dropped
		expect(patch.morphParamLabels!.filter((e) => e.labels.length).map((e) => e.labels[0])).toEqual(['Kick', 'Snare', 'HiHat']);
	});
});

// ── performance rebuilt from editor state (reconnect re-send, Download of a G2-loaded perf) ────

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const CANONICAL_SLOT = [0x21, 0x4a, 0x4a, 0x69, 0x52, 0x52, 0x4d, 0x4d, 0x4d, 0x65, 0x62, 0x60, 0x5b, 0x5b, 0x5b, 0x5a, 0x5a, 0x6f];

describe('writePerfSettings (C_PERF_SETTINGS 0x11)', () => {
	it("rebuilds EmptyPerf.prf2's own 0x11 byte for byte from its parsed fields", () => {
		const { rawHex } = loadFixturePrf2('EmptyPerf.prf2');
		const fixture = extractSection(rawHex, SectionType.PERF_DATA)!;
		const names = ['EmptyPatch', 'No name', 'No name', 'No name'];
		const slots = (['A', 'B', 'C', 'D'] as const).map((slot, i) => ({
			slot,
			name: names[i],
			active: i === 0,
			key: i === 0,
			hold: false,
			bank: i === 0 ? 1 : 0,
			patch: 0,
			range: { lower: 0, upper: 0 },
		}));
		const built = writePerfSettings({ name: 'EmptyPerf', focus: 'A', rangeEnable: false, bpm: 0x1e, clockRunning: false }, slots);
		expect(toHex(built)).toBe(fixture);
	});

	it('packs focus/knob source in header byte 1 and omits the NUL after a 16-char slot name', () => {
		const slots = (['A', 'B', 'C', 'D'] as const).map((slot) => ({
			slot,
			name: slot === 'B' ? '185stepsequencer' : 'x',
			active: true,
			key: false,
			hold: true,
			bank: 3,
			patch: 7,
			range: { lower: 36, upper: 96 },
		}));
		const b = writePerfSettings({ name: 'p', focus: 'C', rangeEnable: true, bpm: 120, clockRunning: true, knobSourceGlobal: true }, slots).slice(3);
		expect(Array.from(b.slice(0, 8))).toEqual([0, (2 << 2) | 1, 1, 120, 0, 1, 0, 0]);
		const slotA = 8 + 2; // 'x' + NUL
		expect(Array.from(b.slice(slotA, slotA + 10))).toEqual([1, 0, 1, 3, 7, 36, 96, 0, 0, 0]);
		const slotB = slotA + 10 + 16; // 16-char name, no terminator
		expect(new TextDecoder().decode(b.slice(slotA + 10, slotB))).toBe('185stepsequencer');
		expect(Array.from(b.slice(slotB, slotB + 10))).toEqual([1, 0, 1, 3, 7, 36, 96, 1, 0, 0]);
	});
});

describe('buildPerformanceTemplate — performance from hardware (get-patch order) slot templates', () => {
	// get-patch answers 0x5a before 0x5b, omits 0x69 and has no 0x6f text section (see patch_slot_sections_canonical).
	function usbOrderTemplate(rawHex: string): string {
		const bytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
		const secs: Uint8Array[] = [];
		for (let ofs = 0; ofs < bytes.length - 2; ) {
			const end = ofs + 3 + ((bytes[ofs + 1] << 8) | bytes[ofs + 2]);
			if (bytes[ofs] !== 0x69 && bytes[ofs] !== SectionType.SEPARATOR) secs.push(bytes.slice(ofs, end));
			ofs = end;
		}
		const order = (t: number) => (t === 0x5a ? 0 : t === 0x5b ? 1 : -1);
		secs.sort((a, b) => (order(a[0]) >= 0 && order(b[0]) >= 0 ? order(a[0]) - order(b[0]) : 0));
		return secs.map(toHex).join('');
	}

	it('yields the canonical slot trains and uploads the same patches', () => {
		const slotFiles = ['EmptyPatch.pch2', 'Clavia demo.pch2', 'Analogue NL2.pch2', 'Basics  NL2.pch2'];
		const fixtures = slotFiles.map(loadFixture);
		const patches = fixtures.map((f) => f.patch);
		const slots = (['A', 'B', 'C', 'D'] as const).map((slot, i) => ({
			slot,
			name: fixtures[i].name.slice(0, 16),
			active: true,
			key: i === 0,
			hold: false,
			bank: 0,
			patch: i,
			range: { lower: 0, upper: 127 },
		}));
		const perfSettings = writePerfSettings({ name: 'Rebuilt', focus: 'A', rangeEnable: false, bpm: 120, clockRunning: false }, slots);
		const template = buildPerformanceTemplate(
			fixtures.map((f) => usbOrderTemplate(f.rawHex)),
			perfSettings,
		);
		const hex = serializePerformance(patches, template, patches.map(extractVariations), [], perfSettings);
		const blocks = sectionBlocks(hex);
		expect(blocks[0][0]).toBe(SectionType.PERF_DATA);
		for (let s = 0; s < 4; s++) expect(s === 0 ? blocks[0].slice(1) : blocks[s]).toEqual(CANONICAL_SLOT);
		expect(blocks[4]).toEqual([SectionType.KNOBS_GLOBAL]);
		expect(extractSection(hex, SectionType.PERF_DATA)).toBe(toHex(perfSettings));
		const { patches: back } = parsePerfFromRawHex('Rebuilt', hex);
		for (let s = 0; s < 4; s++) expectPatchEqual(patches[s], back[s]);
	});
});

describe('setFileDescription — another category for a patch file', () => {
	it('changes only the category (and the CRC); the file still parses with every other field intact', () => {
		const file = new Uint8Array(fs.readFileSync(path.join(FIXTURES, 'Clavia demo.pch2')));
		const before = new PatchParser(file.slice().buffer).parse().description!;
		const category = before.category === 3 ? 4 : 3;
		const out = setFileDescription(file, { ...before, category });

		expect(out.length).toBe(file.length);
		expect(new PatchParser(out.slice().buffer).parse().description).toEqual({ ...before, category });
		// Header and everything outside the description section (and the CRC) is byte for byte the same.
		const differing = [...out.keys()].filter((i) => out[i] !== file[i]);
		const descStart = file.indexOf(SectionType.PATCH_DESC, file.indexOf(0) + 3) + 3;
		expect(differing.filter((i) => i < descStart || (i >= descStart + 15 && i < file.length - 2))).toEqual([]);
	});

	it('leaves every fixture byte-identical when the description is unchanged (also the CRC of version-22 files)', () => {
		for (const f of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.pch2'))) {
			const file = new Uint8Array(fs.readFileSync(path.join(FIXTURES, f)));
			const desc = new PatchParser(file.slice().buffer).parse().description!;
			expect(setFileDescription(file, desc), f).toEqual(file);
		}
	});
});
