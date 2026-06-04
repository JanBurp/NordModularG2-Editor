import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';

beforeEach(() => {
	setActivePinia(createPinia());
});

describe('_applyPatchOutput — malformed binary', () => {
	it('rejects empty data (null regex match)', async () => {
		const store = useSlotsStore();
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: '' }))).rejects.toThrow(
			'Invalid patch hex for slot A',
		);
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
