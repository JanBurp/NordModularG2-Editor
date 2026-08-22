import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';

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

describe('undo/redo coverage for text, name, and description fields', () => {
	it('setPatchText participates in undo/redo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.text = 'hello';
		store.slots['A'].patch = patch;

		store.setPatchText('hello world');
		expect(patch.text).toBe('hello world');

		await store.undo();
		expect(patch.text).toBe('hello');

		await store.redo();
		expect(patch.text).toBe('hello world');
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
