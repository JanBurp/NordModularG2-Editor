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
	it("carries the stored slot's category into the new list entry, as a device slug", async () => {
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

describe('browser store — streamed names load', () => {
	const part = (kind: 'patch' | 'performance', bank: number, complete: boolean, banks: Record<string, any[]>) => ({ kind, bank, complete, banks });

	it('reloadNames asks the daemon for partial names and clears the old lists first', async () => {
		const browser = useBrowserStore();
		browser.synthPatches = [{ bank: 1, location: 1, name: 'Stale' }];
		let during: any;
		(window as any).cli.run = vi.fn().mockImplementation(async () => {
			during = { patches: [...browser.synthPatches], loadingBanks: { ...browser.loadingBanks } };
		});

		await browser.reloadNames();

		expect((window as any).cli.run).toHaveBeenCalledWith(['reload-names', 'partial']);
		expect(during).toEqual({ patches: [], loadingBanks: { patch: 1, performance: 1 } });
		// Cleared by the final `names` event (applyNamesData), not by the command returning.
		expect(browser.loadingBanks).toEqual({ patch: 1, performance: 1 });
		expect(browser.loading).toBe(false);
		browser.applyNamesData({});
		expect(browser.loadingBanks).toBeNull();
	});

	it('reloadNames clears loadingBanks when the command fails', async () => {
		const browser = useBrowserStore();
		(window as any).cli.run = vi.fn().mockRejectedValue(new Error('boom'));
		await browser.reloadNames();
		expect(browser.loadingBanks).toBeNull();
		expect(browser.error).toBe('boom');
	});

	it('appends partial entries per kind, with category only for patches', () => {
		const browser = useBrowserStore();
		browser.loadingBanks = { patch: 1, performance: 1 };

		browser.applyNamesPartial(
			part('patch', 2, false, { '1': [{ location: 1, name: 'A', category: 'bass' }], '2': [{ location: 1, name: 'B', category: 'lead' }] }),
		);
		browser.applyNamesPartial(part('performance', 1, false, { '1': [{ location: 1, name: 'P' }] }));

		expect(browser.synthPatches).toEqual([
			{ bank: 1, location: 1, name: 'A', category: 'bass' },
			{ bank: 2, location: 1, name: 'B', category: 'lead' },
		]);
		expect(browser.synthPerformances).toEqual([{ bank: 1, location: 1, name: 'P' }]);
	});

	it('marks banks at or beyond the reached bank as loading, per kind', () => {
		const browser = useBrowserStore();
		browser.loadingBanks = { patch: 1, performance: 1 };

		browser.applyNamesPartial(part('patch', 3, false, {}));

		expect(browser.isBankLoading('patch', 2)).toBe(false);
		expect(browser.isBankLoading('patch', 3)).toBe(true);
		expect(browser.isBankLoading('patch', 32)).toBe(true);
		expect(browser.isBankLoading('performance', 1)).toBe(true);
	});

	it('a complete part ends loading for that kind only', () => {
		const browser = useBrowserStore();
		browser.loadingBanks = { patch: 1, performance: 1 };

		browser.applyNamesPartial(part('patch', 1, true, {}));

		expect(browser.isBankLoading('patch', 32)).toBe(false);
		expect(browser.isBankLoading('performance', 1)).toBe(true);
	});

	it('reports no bank as loading outside a streamed load', () => {
		expect(useBrowserStore().isBankLoading('patch', 1)).toBe(false);
	});

	it('the final names data replaces the streamed lists and ends the streamed load', () => {
		const browser = useBrowserStore();
		browser.loadingBanks = { patch: 1, performance: 1 };
		browser.applyNamesPartial(part('patch', 1, false, { '1': [{ location: 1, name: 'Partial', category: 'bass' }] }));

		browser.applyNamesData({ patches: { '1': [{ location: 1, name: 'Final', category: 'lead' }] }, performances: {} });

		expect(browser.synthPatches).toEqual([{ bank: 1, location: 1, name: 'Final', category: 'lead' }]);
		expect(browser.loadingBanks).toBeNull();
	});
});
