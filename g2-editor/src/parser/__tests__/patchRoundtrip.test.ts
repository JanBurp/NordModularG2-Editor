import type { Cable, ModuleInstance, ParamLabel, Patch } from '@/types';
import { describe, expect, it } from 'vitest';
import { mutAddCable, mutAddModule, mutDeleteCable, mutDeleteModule, mutMoveModule } from '../patchMutations';

import { PatchParser } from '../nmg2PatchParser';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { serializePatch } from '../nmg2PatchSerializer';

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
		leds: m.leds,
		modes: [...(m.modes ?? [])],
		lv: [...(m.lv ?? [])],
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
	expect(b.patchParams).toEqual(a.patchParams);
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
			const newHex = serializePatch(name, patchA, rawHex);
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
		const newHex = serializePatch(name, patch, rawHex);
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
		const newHex = serializePatch(name, patch, rawHex);
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
		const newHex = serializePatch(name, patch, rawHex);
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
			leds: 0,
			pcnt: 0,
			lv: [],
			modes: [],
		};
		mutAddModule(patch, 1, mod);
		const newHex = serializePatch(name, patch, rawHex);
		const patchB = parsePatchFromRawHex(name, newHex);

		expect(patchB.areas[1].modules).toHaveLength(1);
		const added = patchB.areas[1].modules[0];
		expect(added.type).toBe(1);
		expect(added.index).toBe(1);
		expect(added.horiz).toBe(3);
		expect(added.vert).toBe(7);
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
			leds: 0,
			pcnt,
			lv,
			modes: [],
		};
		mutAddModule(patch, 1, mod);
		const newHex = serializePatch(name, patch, rawHex);
		const patchB = parsePatchFromRawHex(name, newHex);

		const added = patchB.areas[1].modules.find((m) => m.index === 2)!;
		expect(added).toBeDefined();
		expect(added.pcnt).toBe(pcnt);
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

		const newHex = serializePatch(name, patch, rawHex);
		const patchB = parsePatchFromRawHex(name, newHex);

		const cables = patchB.areas[1].cableList ?? [];
		expect(cables).toHaveLength(existingCount + 1);
		const found = cables.find((c) => c.smod === 2 && c.scon === 0 && c.dmod === 1 && c.dcon === 0 && c.colour === 2);
		expect(found).toBeDefined();
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
			leds: 0,
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
		const newHex = serializePatch(name, patch, rawHex);
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
		const newHex = serializePatch(name, patchA, rawHex);
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
			leds: 0,
			pcnt: 0,
			lv: [],
			modes: [],
			paramLabels: labels,
		};
		mutAddModule(patch, 1, mod);

		const newHex = serializePatch(name, patch, rawHex);
		const patchB = parsePatchFromRawHex(name, newHex);

		const added = patchB.areas[1].modules.find((m) => m.index === 1);
		expect(added).toBeDefined();
		expect(added!.paramLabels).toEqual(labels);
	});

	it('omits 0x5b chunk when no module has labels', () => {
		// EmptyPatch starts with no labels; round-trip should not introduce any
		const { name, rawHex, patch: patchA } = loadFixture('EmptyPatch.pch2');
		const newHex = serializePatch(name, patchA, rawHex);
		const patchB = parsePatchFromRawHex(name, newHex);

		for (const i of [0, 1] as const) {
			expect(patchB.areas[i].modules.every((m) => !m.paramLabels)).toBe(true);
		}
	});
});

describe('file save/load round-trip (simulates App.vue saveSlot → handleFileLoad)', () => {
	for (const file of ['EmptyPatch.pch2', 'Basics  NL2.pch2', 'DXBass FM4.pch2']) {
		it(`unmodified patch — ${file}`, () => {
			const { name, rawHex, patch: patchA } = loadFixture(file);

			// Serialize (as saveSlot does after mutations)
			const savedRawHex = serializePatch(name, patchA, rawHex);

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

		const savedRawHex = serializePatch(name, patch, rawHex);
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

		const savedRawHex = serializePatch(name, patch, rawHex);
		const { patch: patchB } = simulateFileSaveAndLoad(name, savedRawHex);

		expect(patchB.description!.variation).toBe(newVariation);
	});

	it('monopoly and category changes survive file save/load cycle', () => {
		const { name, rawHex, patch } = loadFixture('Basics  NL2.pch2');
		const desc = patch.description!;
		desc.monopoly = 1;
		desc.category = 7;

		const savedRawHex = serializePatch(name, patch, rawHex);
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
			leds: 0,
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
			leds: 0,
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

		const savedRawHex = serializePatch(name, patch, rawHex);
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

		const newHex = serializePatch(name, patchA, rawHex);
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

		const hex1 = serializePatch(name, patchA, rawHex);
		const patchB = parsePatchFromRawHex(name, hex1);
		expect(patchB.patchParams![0].patchVol).toBe(99);

		// Re-serialize using hex1 as template — morphs now come from hex1
		const hex2 = serializePatch(name, patchB, hex1);
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

		const newHex = serializePatch(name, patchA, rawHex);
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
