import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useBrowserStore } from '@/store/browser';
import { useDeviceEvents } from '../useDeviceEvents';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined) } };
});

describe('useDeviceEvents — patch_stored category propagation', () => {
	it("carries the stored slot's category into the browser list entry, as a device slug", async () => {
		const slots = useSlotsStore();
		slots.slots['A'].patch = { description: { category: 3 } } as any; // 3 = "Bass" -> "bass"
		slots.slots['A'].name = 'My Patch';
		const browser = useBrowserStore();
		const { handleEvent } = useDeviceEvents(() => {});

		await handleEvent({ type: 'patch_stored', slot: 0, bank: 1, location: 5 });

		expect(browser.synthPatches).toEqual([{ bank: 1, location: 5, name: 'My Patch', category: 'bass' }]);
	});

	it('does not attach a category when the stored slot is a performance (slot 4)', async () => {
		const browser = useBrowserStore();
		const { handleEvent } = useDeviceEvents(() => {});

		await handleEvent({ type: 'patch_stored', slot: 4, bank: 1, location: 1 });

		expect(browser.synthPerformances[0].category).toBeUndefined();
	});
});

describe('useDeviceEvents — names_partial', () => {
	it('routes streamed names into the browser store', async () => {
		const browser = useBrowserStore();
		browser.loadingBanks = { patch: 1, performance: 1 };
		const { handleEvent } = useDeviceEvents(() => {});

		const handled = await handleEvent({
			type: 'names_partial',
			data: { kind: 'patch', bank: 2, complete: false, banks: { '1': [{ location: 1, name: 'A', category: 'bass' }] } },
		});

		expect(handled).toBe(true);
		expect(browser.synthPatches).toEqual([{ bank: 1, location: 1, name: 'A', category: 'bass' }]);
		expect(browser.isBankLoading('patch', 1)).toBe(false);
		expect(browser.isBankLoading('patch', 2)).toBe(true);
	});
});
