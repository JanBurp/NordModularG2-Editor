import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBrowserStore } from '@/store/browser';
import { useSlotsStore } from '@/store/slots';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined) } };
});

function setSlotCategory(slot: 'A' | 'B' | 'C' | 'D', category: number) {
	const slots = useSlotsStore();
	slots.slots[slot].patch = { description: { category } } as any;
}

describe('browser store — storePatch category propagation', () => {
	it('carries the stored slot\'s category into the new list entry, as a device slug', async () => {
		setSlotCategory('A', 3); // 3 = "Bass" -> "bass"
		const browser = useBrowserStore();

		await browser.storePatch(0, 1, 5, 'patch', 'My Patch');

		expect(browser.synthPatches).toEqual([{ bank: 1, location: 5, name: 'My Patch', category: 'bass' }]);
	});

	it('defaults to "no_cat" when the slot has no category set', async () => {
		setSlotCategory('B', 0); // 0 = "No Cat" -> "no_cat"
		const browser = useBrowserStore();

		await browser.storePatch(1, 2, 9, 'patch', 'Other Patch');

		expect(browser.synthPatches[0].category).toBe('no_cat');
	});

	it('does not attach a category when storing a performance', async () => {
		setSlotCategory('C', 8); // would be "lead" if this leaked through
		const browser = useBrowserStore();

		await browser.storePatch(2, 1, 1, 'performance', 'My Perf');

		expect(browser.synthPerformances[0].category).toBeUndefined();
	});
});
