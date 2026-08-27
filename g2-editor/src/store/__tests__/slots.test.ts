import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useHistoryStore } from '@/store/history';
import { useDeviceStore, DeviceStatus } from '@/store/device';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined), runBatch: vi.fn().mockResolvedValue([]) } };
});

function makePatch(): any {
	return {
		description: { variation: 0 },
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [], cableList: [] },
		],
	};
}

// Loads a real, parseable fixture as {name, rawHex} — needed wherever a test must reach
// _applyPatchOutput's full-reparse branch (a synthetic hex blob would throw as malformed).
async function loadFixture(): Promise<{ name: string; rawHex: string }> {
	const fs = await import('fs');
	const path = await import('path');
	const { fileURLToPath } = await import('url');
	const dirname = fileURLToPath(new URL('.', import.meta.url));
	const buf = fs.readFileSync(path.join(dirname, '../../../../test-patches/EmptyPatch.pch2'));
	const fileBytes = new Uint8Array(buf);
	let ofs = 0;
	while (ofs < fileBytes.length && fileBytes[ofs] !== 0) ofs++;
	const name = new TextDecoder().decode(fileBytes.slice(0, ofs));
	const rawHex = Array.from(fileBytes.slice(ofs + 3))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return { name, rawHex };
}

describe('_applyPatchOutput — malformed binary', () => {
	it('rejects empty data (null regex match)', async () => {
		const store = useSlotsStore();
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: '' }))).rejects.toThrow('Invalid patch hex for slot A');
	});

	it('rejects data that is too short for a valid patch', async () => {
		const store = useSlotsStore();
		// 2 hex chars = 1 byte — far too short for any valid pch2 structure
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: 'ab' }))).rejects.toThrow();
	});

	it('rejects when section bytes contain only zeros (corrupted header)', async () => {
		const store = useSlotsStore();
		// 40 zero bytes — valid hex format but invalid patch structure
		const zeroes = '00'.repeat(40);
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: zeroes }))).rejects.toThrow();
	});

	it('returns early without parsing when the hex matches what is already loaded', async () => {
		const store = useSlotsStore();
		// Seed the slot with a non-null patch and matching rawHex so the early-return path is taken
		const fakePatch = { description: { variation: 0 } } as any;
		store.slots['A'].rawHex = 'cafebabe';
		store.slots['A'].patch = fakePatch;
		const result = await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'cached', data: 'cafebabe' }));
		expect(result.rawHex).toBe('cafebabe');
		expect(result.name).toBe('cached');
	});
});

describe('breakJackConnection', () => {
	it('preserves userColour when splicing a star topology (driving output present)', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [
			{ colour: 0, userColour: 0, smod: 0, scon: 0, dir: 1, dmod: 10, dcon: 0 }, // driving output -> module 10 input 0
			{ colour: 0, dir: 0, smod: 10, scon: 0, dmod: 11, dcon: 0 }, // neighbor 1
			{ colour: 0, dir: 0, smod: 10, scon: 0, dmod: 12, dcon: 0 }, // neighbor 2
		];
		store.slots['A'].patch = patch;

		await store.breakJackConnection(10, 0, 'input', 'voice');

		const spliced = patch.areas[1].cableList.filter((c: any) => c.smod === 0 && c.scon === 0);
		expect(spliced).toHaveLength(2);
		for (const c of spliced) expect(c.userColour).toBe(0);
	});

	it('preserves userColour when splicing with no driving source', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [
			{ colour: 3, userColour: 3, dir: 0, smod: 10, scon: 0, dmod: 11, dcon: 0 },
			{ colour: 3, dir: 0, smod: 10, scon: 0, dmod: 12, dcon: 0 },
		];
		store.slots['A'].patch = patch;

		await store.breakJackConnection(10, 0, 'input', 'voice');

		const cables = patch.areas[1].cableList;
		expect(cables).toHaveLength(1);
		expect(cables[0].userColour).toBe(3);
	});
});

describe('paste', () => {
	it('preserves userColour on the pasted cable', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		const modInstance = (index: number) => ({ type: 1, index, horiz: 0, vert: 0, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] });
		const entries = [
			{ src: modInstance(1), newId: 1, col: 0, row: 0 },
			{ src: modInstance(2), newId: 2, col: 3, row: 0 },
		];
		const cables = [{ newSmod: 1, newDmod: 2, colour: 1, userColour: 1, scon: 0, dcon: 0, dir: 1 }];

		await store.paste(entries as any, cables, 'voice');

		const pasted = patch.areas[1].cableList.find((c: any) => c.smod === 1 && c.dmod === 2);
		expect(pasted).toBeDefined();
		expect(pasted.userColour).toBe(1);
	});
});

describe('edited flag', () => {
	it('a mutating action marks the slot edited', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;
		expect(store.isSlotEdited('A')).toBe(false);

		await store.setModuleLabel(1, 'Foo', 'voice');

		expect(store.isSlotEdited('A')).toBe(true);
		expect(store.slots['A'].rawHex).toBeNull();
	});

	it('_applyPatchOutput clears the edited flag once a fresh parse completes', async () => {
		const { name, rawHex } = await loadFixture();

		const store = useSlotsStore();
		store.slots['A'].edited = true;
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));

		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('loadPatchFile resets the edited flag', () => {
		const store = useSlotsStore();
		store.slots['A'].edited = true;
		store.loadPatchFile('A', makePatch(), 'test');
		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('loadPerformanceFile resets the edited flag for all 4 slots', () => {
		const store = useSlotsStore();
		for (const s of ['A', 'B', 'C', 'D'] as const) store.slots[s].edited = true;
		store.loadPerformanceFile([makePatch(), makePatch(), makePatch(), makePatch()], ['a', 'b', 'c', 'd'], 'perf', 'cafe');
		for (const s of ['A', 'B', 'C', 'D'] as const) expect(store.isSlotEdited(s)).toBe(false);
	});

	it('saveSlot resets the edited flag after a successful save', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].rawHex = '00'.repeat(20); // non-null: skips re-serialization, isolating the save-reset behavior
		store.slots['A'].edited = true;
		(globalThis as any).window.electronAPI = { savePatch: vi.fn().mockResolvedValue(undefined) };

		await store.saveSlot('A', '/tmp/test.pch2');

		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('savePerformance resets the edited flag for all 4 slots after a successful save', async () => {
		const store = useSlotsStore();
		for (const s of ['A', 'B', 'C', 'D'] as const) {
			store.slots[s].patch = makePatch();
			store.slots[s].edited = true;
		}
		store.performanceRawHex = '00'.repeat(20);
		(globalThis as any).window.electronAPI = { savePatch: vi.fn().mockResolvedValue(undefined) };
		vi.spyOn(await import('@/parser/nmg2PatchSerializer'), 'serializePerformance').mockReturnValue('00'.repeat(20));

		await store.savePerformance('/tmp/test.prf2');

		for (const s of ['A', 'B', 'C', 'D'] as const) expect(store.isSlotEdited(s)).toBe(false);
	});
});

describe('setMorphGroupLabel', () => {
	it('mutates patch.morphParamLabels, marks the slot dirty, and pushes the right CLI command', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(0, 'Foo');

		expect(patch.morphParamLabels).toEqual([{ paramIndex: 8, isString: true, paramLen: 8, labels: ['Foo'] }]);
		expect(store.isSlotEdited('A')).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['set-param-label', 'A', 'patch', '1', '8', 'Foo']);
	});

	it('updates the existing entry in place when the group is renamed again', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(2, 'First');
		await store.setMorphGroupLabel(2, 'Second');

		expect(patch.morphParamLabels).toEqual([{ paramIndex: 10, isString: true, paramLen: 8, labels: ['Second'] }]);
	});

	it('participates in undo/redo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(0, 'Foo');
		expect(patch.morphParamLabels?.find((pl: any) => pl.paramIndex === 8)?.labels[0]).toBe('Foo');

		await store.undo();
		expect(patch.morphParamLabels?.find((pl: any) => pl.paramIndex === 8)?.labels[0]).toBe('');

		await store.redo();
		expect(patch.morphParamLabels?.find((pl: any) => pl.paramIndex === 8)?.labels[0]).toBe('Foo');
	});
});

describe('undo/redo coverage for text, name, and description fields', () => {
	it('setPatchText participates in undo/redo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.text = 'hello';
		store.slots['A'].patch = patch;

		store.setPatchText('A', 'hello world');
		expect(patch.text).toBe('hello world');

		await store.undo();
		expect(patch.text).toBe('hello');

		await store.redo();
		expect(patch.text).toBe('hello world');
	});

	it('setPatchText targets the given slot regardless of which slot is focused (slot-switch race fix)', () => {
		const store = useSlotsStore();
		const patchA = makePatch();
		patchA.text = 'A original';
		const patchB = makePatch();
		patchB.text = 'B original';
		store.slots['A'].patch = patchA;
		store.slots['B'].patch = patchB;
		// uiStore.slotInFocus defaults to 'A', but we're explicitly targeting 'B' —
		// simulates a debounced commit firing after the user already switched away from B.
		store.setPatchText('B', 'B edited');

		expect(patchB.text).toBe('B edited');
		expect(patchA.text).toBe('A original');
		expect(store.slots['B'].textDirty).toBe(true);
		expect(store.slots['A'].textDirty).toBe(false);
	});

	it('setPatchName participates in undo/redo and marks the slot edited', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].name = 'Old Name';

		await store.setPatchName('New Name');
		expect(store.slots['A'].name).toBe('New Name');
		expect(store.isSlotEdited('A')).toBe(true);

		await store.undo();
		expect(store.slots['A'].name).toBe('Old Name');

		await store.redo();
		expect(store.slots['A'].name).toBe('New Name');
	});

	for (const field of ['category', 'monopoly', 'voices', 'height'] as const) {
		it(`setPatchDescriptionField('${field}') participates in undo/redo and marks the slot edited`, async () => {
			const store = useSlotsStore();
			const patch = makePatch();
			patch.description[field] = 1;
			store.slots['A'].patch = patch;

			store.setPatchDescriptionField(field, 42);
			expect(patch.description[field]).toBe(42);
			expect(store.isSlotEdited('A')).toBe(true);

			await store.undo();
			expect(patch.description[field]).toBe(1);

			await store.redo();
			expect(patch.description[field]).toBe(42);
		});
	}
});

describe('undo() clears the dirty flag once the stack is empty', () => {
	it('clears edited after undoing the only edit', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].name = 'Old';

		await store.setPatchName('New');
		expect(store.isSlotEdited('A')).toBe(true);

		await store.undo();
		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('leaves edited set while earlier entries remain', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].name = 'Old';

		await store.setPatchName('Mid');
		await store.setPatchName('New');
		expect(store.isSlotEdited('A')).toBe(true);

		await store.undo(); // back to 'Mid' — one earlier entry (Old → Mid) still in the stack
		expect(store.slots['A'].name).toBe('Mid');
		expect(store.isSlotEdited('A')).toBe(true);
	});
});

describe('_applyPatchOutput / loadSlot — preserveHistory', () => {
	it('preserveHistory=true keeps undo history and the dirty flag (hardware-echo resync after our own edit)', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		// Simulate having just made a structural edit: dirty, one undo entry recorded, and the
		// edit's own _markSlotDirty already nulled rawHex — exactly the state a real add/move/
		// delete-module action leaves behind right before the hardware's version-change echo arrives.
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }), true);

		expect(store.isSlotEdited('A')).toBe(true);
		expect(hist.canUndo('A')).toBe(true);
	});

	it('preserveHistory=false (default) clears undo history and the dirty flag (genuine fresh load)', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));

		expect(store.isSlotEdited('A')).toBe(false);
		expect(hist.canUndo('A')).toBe(false);
	});

	it('loadSlot forwards preserveHistory to _applyPatchOutput', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();
		(globalThis as any).window.cli.run = vi.fn().mockResolvedValue(JSON.stringify({ slot: 'A', name, data: rawHex }));

		await store.loadSlot('A');
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;

		await store.loadSlot('A', true);

		expect(store.isSlotEdited('A')).toBe(true);
		expect(hist.canUndo('A')).toBe(true);
	});
});

// Offline mode (no daemon/device): window.cli.run/runBatch reject immediately. Before the fix,
// these actions pushed to hardware BEFORE calling hist.record — an unguarded rejection aborted
// the function early, so the edit never made it into the undo stack even though the local patch
// mutation had already happened.
describe('module add/move/delete record undo even when the CLI/hardware call fails (offline)', () => {
	function moduleStub(index: number) {
		return { index, type: 5, horiz: 0, vert: 0, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] };
	}

	beforeEach(() => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		(globalThis as any).window.cli.runBatch = vi.fn().mockRejectedValue(new Error('Daemon not running'));
	});

	it('addModule records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.addModule(5, 1, 0, 0, 'voice');

		expect(patch.areas[1].modules.some((m: any) => m.index === 1)).toBe(true);
		expect(store.isSlotEdited('A')).toBe(true);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('dropModuleWithCollision (drag-from-palette / QuickAddModule add) records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.dropModuleWithCollision(5, 0, 0, 'voice', patch.areas[1].modules);

		expect(patch.areas[1].modules).toHaveLength(1);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('moveModulesWithCollision records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [moduleStub(1)];
		store.slots['A'].patch = patch;

		await store.moveModulesWithCollision([1], 1, 0, 'voice', patch.areas[1].modules);

		expect(patch.areas[1].modules[0].horiz).toBe(1);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('deleteSelection records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [moduleStub(1)];
		store.slots['A'].patch = patch;

		await store.deleteSelection([1], [], 'voice', patch.areas[1].modules, patch.areas[1].cableList);

		expect(patch.areas[1].modules).toHaveLength(0);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('deleteModule records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [moduleStub(1)];
		store.slots['A'].patch = patch;

		await store.deleteModule(1, 'voice');

		expect(patch.areas[1].modules).toHaveLength(0);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});
});

describe('cable add/color/delete record undo even when the CLI/hardware call fails (offline)', () => {
	beforeEach(() => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		(globalThis as any).window.cli.runBatch = vi.fn().mockRejectedValue(new Error('Daemon not running'));
	});

	it('addCable records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', 1);

		expect(patch.areas[1].cableList).toHaveLength(1);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('setCableColor records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [{ colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.setCableColor(2, 0, 'input', 5, 'voice');

		expect(patch.areas[1].cableList[0].colour).toBe(5);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('deleteConnectedCables records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [{ colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.deleteConnectedCables(2, 0, 'input', 'voice');

		expect(patch.areas[1].cableList).toHaveLength(0);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});
});

describe('pushPatchToDevice', () => {
	function seedDirtyPatch() {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;
		// Simulates rawHex cached straight from hardware (get-patch/slot_data) — NO trailing CRC,
		// since g2_get_patch's patch_usb_to_pch2 strips it on read. templateRawHex is what a real
		// hardware load always sets alongside it.
		store.slots['A'].rawHex = '00'.repeat(20);
		store.slots['A'].templateRawHex = '00'.repeat(20);
		store.slots['A'].textDirty = true;
		return store;
	}

	it('pushes via upload-patch, always force-reserializing rather than trusting a cached rawHex that may lack the CRC upload-patch expects', async () => {
		const store = seedDirtyPatch();
		useDeviceStore().status = DeviceStatus.Connected;
		(globalThis as any).window.electronAPI = { writeTempPatch: vi.fn().mockResolvedValue('/tmp/g2-notes-x/Test.pch2') };
		const runSpy = (globalThis as any).window.cli.run;
		const serializeSpy = vi.spyOn(await import('@/parser/nmg2PatchSerializer'), 'serializePatch').mockReturnValue('ab'.repeat(20) + 'cdef');

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(true);
		expect(serializeSpy).toHaveBeenCalled(); // re-serialized despite rawHex already being cached/non-null
		expect(store.slots['A'].rawHex).toBe('ab'.repeat(20) + 'cdef'); // cache updated with the CRC-safe result
		expect(store.slots['A'].textDirty).toBe(false);
		expect(runSpy).toHaveBeenCalledWith(['upload-patch', 'A', '/tmp/g2-notes-x/Test.pch2']);
	});

	it('no-ops when the slot is not dirty — never re-upload an untouched slot', async () => {
		const store = seedDirtyPatch();
		store.slots['A'].textDirty = false;
		useDeviceStore().status = DeviceStatus.Connected;
		(globalThis as any).window.electronAPI = { writeTempPatch: vi.fn() };

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(false);
		expect((globalThis as any).window.electronAPI.writeTempPatch).not.toHaveBeenCalled();
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalledWith(expect.arrayContaining(['upload-patch']));
	});

	it('no-ops (stays dirty) when not connected', async () => {
		const store = seedDirtyPatch();
		useDeviceStore().status = DeviceStatus.Disconnected;
		(globalThis as any).window.electronAPI = { writeTempPatch: vi.fn() };

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(false);
		expect(store.slots['A'].textDirty).toBe(true);
		expect((globalThis as any).window.electronAPI.writeTempPatch).not.toHaveBeenCalled();
	});

	it('no-ops (stays dirty) when an upload is already in flight', async () => {
		const store = seedDirtyPatch();
		useDeviceStore().status = DeviceStatus.Connected;
		store.uploadingFromFile = true;
		(globalThis as any).window.electronAPI = { writeTempPatch: vi.fn() };

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(false);
		expect(store.slots['A'].textDirty).toBe(true);
		expect((globalThis as any).window.electronAPI.writeTempPatch).not.toHaveBeenCalled();
	});
});

describe('assignedVoicesForSlot', () => {
	it('returns the correct count for each slot label', () => {
		const store = useSlotsStore();
		store.slots.A.assignedVoices = 2;
		store.slots.B.assignedVoices = 3;
		store.slots.C.assignedVoices = 4;
		store.slots.D.assignedVoices = 5;
		expect(store.assignedVoicesForSlot('A')).toBe(2);
		expect(store.assignedVoicesForSlot('B')).toBe(3);
		expect(store.assignedVoicesForSlot('C')).toBe(4);
		expect(store.assignedVoicesForSlot('D')).toBe(5);
	});

	it('returns 0 for a slot with no voices assigned', () => {
		const store = useSlotsStore();
		expect(store.assignedVoicesForSlot('A')).toBe(0);
	});
});

describe('assignParamToPage / deassignParamPage', () => {
	beforeEach(() => {
		useDeviceStore().status = DeviceStatus.Connected;
	});

	it('assignParamToPage writes the record, marks the slot dirty, and records undo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.assignParamToPage('A', 5, 1, 2, 0);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 1, moduleIndex: 2, paramIndex: 0, isLed: 0 }]);
		expect(patch.paramPages).toEqual(store.slots['A'].paramPages);
		expect(store.isSlotEdited('A')).toBe(true);
		expect(useHistoryStore().canUndo('A')).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['assign-knob', 'A', 'va', '2', '0', '5']);
	});

	it('assigning into an occupied slot evicts the old occupant', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.assignParamToPage('A', 5, 0, 2, 3);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 2, paramIndex: 3, isLed: 0 }]);
	});

	it('assigning an already-assigned param moves it (old slotIndex cleared)', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.assignParamToPage('A', 9, 0, 1, 0);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 9, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
	});

	it('deassignParamPage removes the record and undo restores it', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.deassignParamPage('A', 5);
		expect(store.slots['A'].paramPages).toEqual([]);

		await store.undo();
		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
	});

	it('undo/redo round-trip for assignParamToPage', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.undo();
		expect(store.slots['A'].paramPages).toEqual([]);

		await store.redo();
		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
	});

	it('records undo despite a rejected CLI call (offline)', async () => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await expect(store.assignParamToPage('A', 5, 0, 1, 0)).rejects.toThrow();

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});
});
