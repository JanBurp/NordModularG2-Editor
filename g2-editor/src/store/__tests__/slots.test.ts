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
