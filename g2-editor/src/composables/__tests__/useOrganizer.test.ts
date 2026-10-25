import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { asCell, asStorage, useOrganizer } from '@/components/banks/useOrganizer';
import { useBrowserStore } from '@/store/browser';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue('') } };
	// Organizer state is shared between components (module level): start each test clean.
	const org = useOrganizer();
	org.roomWarning.value = null;
	org.clearSelection();
});

const P = (bank: number, location: number) => ({ kind: 'patch' as const, bank, location });

describe('useOrganizer — multi-drop room check', () => {
	it('warns and places nothing when the bank has too few free locations from the drop point', async () => {
		const browser = useBrowserStore();
		for (const loc of [126, 127]) browser.upsertPatch(3, loc, 'patch', `X${loc}`);
		const placeMany = vi.spyOn(browser, 'placeMany');
		const org = useOrganizer();

		// From 3-125 only 125 and 128 are free: two of three patches would fit.
		await org.placeInto([asCell(P(1, 1)), asCell(P(1, 2)), asCell(P(1, 3))], 'patch', 3, 125, true);

		expect(org.roomWarning.value).toEqual({ needed: 3, free: 2, bank: 3, from: 125 });
		expect(placeMany).not.toHaveBeenCalled();
	});

	it('places into the free locations in location order when they fit', async () => {
		const browser = useBrowserStore();
		browser.upsertPatch(3, 11, 'patch', 'Occupied');
		const placeMany = vi.spyOn(browser, 'placeMany').mockResolvedValue(true);
		const org = useOrganizer();

		// Selected in reverse order: placed in location order, skipping occupied 3-11.
		await org.placeInto([asCell(P(1, 7)), asCell(P(1, 2))], 'patch', 3, 10, true);

		expect(org.roomWarning.value).toBeNull();
		expect(placeMany).toHaveBeenCalledWith([asCell(P(1, 2)), asCell(P(1, 7))], [P(3, 10), P(3, 12)], true);
	});
});

describe('useOrganizer — selection', () => {
	it('Shift-click selects the range between anchor and target in the area order; Cmd/Ctrl-click toggles', () => {
		const org = useOrganizer();
		const items = ['a', 'b', 'c', 'd'].map((n) => asStorage({ file: `/s/${n}`, name: n, kind: 'patch' }));
		org.registerArea({ id: 'storage', items: () => items, cols: () => 4 });

		org.select(items[1], 'single', 'storage');
		org.select(items[3], 'range', 'storage');
		expect(org.selection.value).toEqual([items[1], items[2], items[3]]);

		org.select(items[2], 'toggle', 'storage');
		expect(org.selection.value).toEqual([items[1], items[3]]);
	});
});

describe('useOrganizer — selection holds occupied cells only', () => {
	it('leaves empty cells out of clicks, Cmd-clicks, Shift-click ranges and Shift+arrow ranges', () => {
		const browser = useBrowserStore();
		for (const loc of [2, 4]) browser.upsertPatch(1, loc, 'patch', `X${loc}`);
		const org = useOrganizer();
		const cells = [1, 2, 3, 4, 5].map((l) => asCell(P(1, l)));
		const unregister = org.registerArea({ id: 'grid-test', items: () => cells, cols: () => 8 });
		const locs = () => org.selection.value.map((s) => (s.type === 'cell' ? s.loc.location : 0));

		org.select(cells[0], 'single', 'grid-test');
		expect(locs()).toEqual([]);
		expect(org.isCursor(cells[0])).toBe(true); // the cursor still moves onto an empty cell

		org.select(cells[4], 'range', 'grid-test');
		expect(locs()).toEqual([2, 4]);

		org.select(cells[2], 'toggle', 'grid-test');
		expect(locs()).toEqual([2, 4]);

		org.select(cells[1], 'single', 'grid-test');
		org.moveCursor(1, 0, true);
		expect(locs()).toEqual([2]);
		unregister();
	});
});

describe('useOrganizer — "Copy to Bank" entries and deleting', () => {
	it('copies one item to the first empty location of each shown bank, several via placeInto', async () => {
		const browser = useBrowserStore();
		const { useUiStore } = await import('@/store/ui');
		useUiStore().organizerBanks = [1, 2];
		browser.upsertPatch(2, 1, 'patch', 'Taken');
		const org = useOrganizer();
		const copyOne = vi.fn();

		const single = org.copyToBankItems([asCell(P(1, 5))], copyOne);
		expect(single.map((i) => i.label)).toEqual(['Copy to Bank 1 (at 1-1)', 'Copy to Bank 2 (at 2-2)']);
		single[1].action!();
		expect(copyOne).toHaveBeenCalledWith(P(2, 2));

		const placeMany = vi.spyOn(browser, 'placeMany').mockResolvedValue(true);
		const multi = org.copyToBankItems([asCell(P(1, 5)), asCell(P(1, 6))], copyOne);
		expect(multi.map((i) => i.label)).toEqual(['Copy 2 to Bank 1', 'Copy 2 to Bank 2']);
		await multi[1].action!();
		expect(placeMany).toHaveBeenCalledWith([asCell(P(1, 5)), asCell(P(1, 6))], [P(2, 2), P(2, 3)], false);
	});

	it('deletes one item right away, asks before deleting several', () => {
		const browser = useBrowserStore();
		for (const loc of [1, 2]) browser.upsertPatch(1, loc, 'patch', `X${loc}`);
		const clearLocations = vi.spyOn(browser, 'clearLocations').mockResolvedValue(true);
		const org = useOrganizer();

		org.requestClear([asCell(P(1, 1))]);
		expect(org.clearRequest.value).toBeNull();
		expect(clearLocations).toHaveBeenCalledWith([P(1, 1)]);

		org.requestClear([asCell(P(1, 1)), asCell(P(1, 2))]);
		expect(org.clearRequest.value).toHaveLength(2);
		expect(clearLocations).toHaveBeenCalledTimes(1);
		org.clearRequest.value = null;
	});
});
