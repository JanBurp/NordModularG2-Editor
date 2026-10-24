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
