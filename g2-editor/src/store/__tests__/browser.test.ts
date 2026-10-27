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

describe('browser store — flash usage', () => {
	it('takes the per-mille flashUsage from the names data as a used percentage', () => {
		const browser = useBrowserStore();
		browser.applyNamesData({ patches: {}, performances: {}, flashUsage: 632 });
		expect(browser.flashUsedPercent).toBe(63.2);
	});

	it('is unknown (null) when the names data carries no flashUsage', () => {
		const browser = useBrowserStore();
		browser.applyNamesData({ patches: {}, performances: {} });
		expect(browser.flashUsedPercent).toBeNull();
	});
});

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

describe('browser store — loadDiskList error message', () => {
	function failListWith(code: string) {
		(globalThis as any).window.electronAPI = {
			patches: { list: vi.fn().mockResolvedValue({ success: false, error: `${code}: raw node message`, code, entries: [] }) },
		};
	}

	it('says the folder may have been moved, renamed or deleted when it is missing', async () => {
		failListWith('ENOENT');
		const browser = useBrowserStore();

		await browser.loadDiskList('/gone');

		expect(browser.diskError).toBe('Cannot open this folder. It may have been moved, renamed or deleted. Click the folder icon to choose another folder.');
	});

	it.each(['EACCES', 'EPERM'])('says there is no permission on %s', async (code) => {
		failListWith(code);
		const browser = useBrowserStore();

		await browser.loadDiskList('/locked');

		expect(browser.diskError).toBe('No permission to open this folder. Click the folder icon to choose another folder.');
	});
});

// A fake G2 flash + storage folder behind window.cli.run / window.electronAPI, so the
// Bank Organizer actions can be checked end to end: what lands where, nothing lost.
describe('browser store — Bank Organizer', () => {
	let flash: Map<string, string>; // `${kind}-${bank}-${loc}` -> patch name (stands in for the data)
	let files: Map<string, string>; // path -> patch name in the file
	let calls: string[][];

	const key = (kind: string, bank: string | number, loc: string | number) => `${kind}-${bank}-${loc}`;
	const P = (bank: number, location: number) => ({ kind: 'patch' as const, bank, location });
	const cells = (...locs: ReturnType<typeof P>[]) => locs.map((loc) => ({ type: 'cell' as const, loc }));

	beforeEach(async () => {
		flash = new Map();
		files = new Map();
		calls = [];
		(globalThis as any).window = {
			cli: {
				run: vi.fn(async (args: string[]) => {
					calls.push(args);
					const [cmd, kind, bank, loc, file, name] = args;
					if (cmd === 'get-location') {
						const stored = flash.get(key(kind, bank, loc));
						if (stored === undefined) return JSON.stringify({ name: '', empty: true, corrupt: false });
						files.set(file, stored);
						return JSON.stringify({ name: stored, empty: false, corrupt: false });
					}
					if (cmd === 'put-location') {
						if (!files.has(file)) throw new Error('put-location: cannot open source file');
						flash.set(key(kind, bank, loc), name);
						return JSON.stringify({ name });
					}
					if (cmd === 'clear-patch') flash.delete(key(kind, bank, loc));
					return '';
				}),
			},
			electronAPI: {
				patches: {
					storageDir: vi.fn(async () => '/hold'),
					// Like the real one: only the folder itself (not .g2-organizer-history below it).
					list: vi.fn(async (dir: string) => ({
						success: true,
						entries: [...files.keys()]
							.filter((p) => p.slice(0, p.lastIndexOf('/')) === dir)
							.map((p) => ({ name: p.split('/').pop()!, path: p, isDir: false })),
					})),
					load: vi.fn(async () => ({ success: false })),
					storageRemove: vi.fn(async (p: string) => void files.delete(p)),
					storageCopy: vi.fn(async (from: string, to: string) => void files.set(to, files.get(from)!)),
				},
			},
		};
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		useDeviceStore().status = DeviceStatus.Connected;
	});

	function seed(entries: [number, number, string][]) {
		const browser = useBrowserStore();
		for (const [bank, loc, name] of entries) {
			flash.set(key('patch', bank, loc), name);
			browser.upsertPatch(bank, loc, 'patch', name);
		}
		return browser;
	}

	it('moves onto an empty location: written there, source cleared after the write', async () => {
		const browser = seed([[1, 1, 'Lead']]);

		expect(await browser.moveLocation(P(1, 1), P(2, 5), false)).toBe(true);

		expect(flash).toEqual(new Map([['patch-2-5', 'Lead']]));
		expect(browser.synthPatches).toEqual([{ bank: 2, location: 5, name: 'Lead' }]);
		const order = calls.map((c) => c[0]);
		expect(order.indexOf('put-location')).toBeLessThan(order.indexOf('clear-patch'));
		expect(browser.storage).toEqual([]);
	});

	it('swaps when moving onto an occupied location, leaving nothing in storage', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
		]);

		await browser.moveLocation(P(1, 1), P(1, 2), false);

		expect(flash.get('patch-1-1')).toBe('Pad');
		expect(flash.get('patch-1-2')).toBe('Lead');
		expect([...files.keys()].filter((f) => !f.includes('/.g2-organizer-history/'))).toEqual([]); // only undo copies left
		expect(browser.storage).toEqual([]);
	});

	it('copy onto an occupied location parks the displaced patch in storage', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
		]);

		await browser.moveLocation(P(1, 1), P(1, 2), true);

		expect(flash.get('patch-1-1')).toBe('Lead');
		expect(flash.get('patch-1-2')).toBe('Lead');
		expect(browser.storage.map((h) => h.name)).toEqual(['Pad']);
	});

	it('copies to and from storage, parking an occupied target on the way back', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[3, 7, 'Bass'],
		]);

		await browser.toStorage([P(1, 1)]);
		expect(flash.get('patch-1-1')).toBe('Lead');
		expect(browser.storage.map((h) => h.name)).toEqual(['Lead']);

		await browser.fromStorage(browser.storage[0], P(3, 7));
		expect(flash.get('patch-3-7')).toBe('Lead');
		expect(browser.storage.map((h) => h.name)).toEqual(['Lead', 'Bass']);
	});

	it('keeps names with separators and special characters intact through the file name', async () => {
		const browser = seed([
			[1, 1, 'A/B__C %d'],
			[1, 2, '.dot'],
		]);

		await browser.toStorage([P(1, 1)]);
		await browser.toStorage([P(1, 2)]);

		expect(browser.storage.map((h) => h.name)).toEqual(['A/B__C %d', '.dot']);
	});

	it('lists a foreign file whose name is not URI-encoded (e.g. "100% Lead") as it is', async () => {
		files.set('/hold/100% Lead.pch2', 'Lead');
		const browser = useBrowserStore();

		await browser.loadStorage();

		expect(browser.storage.map((h) => h.name)).toEqual(['100% Lead']);
	});

	it('clears several locations in one go', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
			[1, 3, 'Bass'],
		]);

		expect(await browser.clearLocations([P(1, 1), P(1, 3)])).toBe(true);

		expect(flash).toEqual(new Map([['patch-1-2', 'Pad']]));
		expect(browser.synthPatches.map((p) => p.name)).toEqual(['Pad']);
	});

	it('freeFrom lists the empty locations from a start up to 128', () => {
		const browser = seed([
			[2, 120, 'A'],
			[2, 122, 'B'],
		]);

		expect(browser.freeFrom('patch', 2, 119).map((l) => l.location)).toEqual([119, 121, 123, 124, 125, 126, 127, 128]);
	});

	it('placeMany moves into free locations, writing every copy before clearing any source', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
			[2, 5, 'Bass'],
		]);
		const dsts = browser.freeFrom('patch', 2, 5).slice(0, 2); // skips occupied 2-5

		expect(await browser.placeMany(cells(P(1, 1), P(1, 2)), dsts, true)).toBe(true);

		expect(flash).toEqual(
			new Map([
				['patch-2-5', 'Bass'],
				['patch-2-6', 'Lead'],
				['patch-2-7', 'Pad'],
			]),
		);
		const order = calls.map((c) => c[0]);
		expect(order.lastIndexOf('put-location')).toBeLessThan(order.indexOf('clear-patch'));
		expect(browser.storage).toEqual([]); // temp copies cleaned up
		expect(browser.organizerProgress).toBeNull();
	});

	it('placeMany copy keeps the sources; storage items are copied and stay in storage', async () => {
		const browser = seed([[1, 1, 'Lead']]);
		await browser.toStorage([P(1, 1)]);
		const item = browser.storage[0];

		await browser.placeMany(
			[
				{ type: 'cell', loc: P(1, 1) },
				{ type: 'storage', item },
			],
			[P(3, 1), P(3, 2)],
			false,
		);

		expect(flash.get('patch-1-1')).toBe('Lead');
		expect(flash.get('patch-3-1')).toBe('Lead');
		expect(flash.get('patch-3-2')).toBe('Lead');
		expect(browser.storage.map((h) => h.name)).toEqual(['Lead']);
	});

	it('placeMany failing halfway clears no source at all', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
		]);
		const run = (window as any).cli.run;
		const original = run.getMockImplementation();
		let puts = 0;
		run.mockImplementation(async (args: string[]) => {
			if (args[0] === 'put-location' && ++puts === 2) throw new Error('no reply from device');
			return original(args);
		});

		expect(await browser.placeMany(cells(P(1, 1), P(1, 2)), [P(4, 1), P(4, 2)], true)).toBe(false);

		expect(flash.get('patch-1-1')).toBe('Lead');
		expect(flash.get('patch-1-2')).toBe('Pad');
		expect(calls.some((c) => c[0] === 'clear-patch')).toBe(false);
		expect(browser.organizerProgress).toBeNull();
	});

	it('reports progress per step while placing several patches', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
		]);
		const seen: string[] = [];
		const run = (window as any).cli.run;
		const original = run.getMockImplementation();
		run.mockImplementation(async (args: string[]) => {
			const p = browser.organizerProgress;
			if (p) seen.push(`${p.verb} ${p.done}/${p.total} ${p.name}`);
			return original(args);
		});

		await browser.placeMany(cells(P(1, 1), P(1, 2)), [P(2, 1), P(2, 2)], true);

		expect([...new Set(seen)]).toEqual(['Moving 0/4 Lead', 'Moving 1/4 Pad', 'Moving 2/4 Lead', 'Moving 3/4 Pad']);
		expect(browser.organizerProgress).toBeNull();
	});

	it('does nothing without a connected G2', async () => {
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		useDeviceStore().status = DeviceStatus.Disconnected;
		const browser = seed([[1, 1, 'Lead']]);

		expect(await browser.moveLocation(P(1, 1), P(1, 2), false)).toBe(false);
		expect(calls).toEqual([]);
	});

	it('loses nothing when a swap fails halfway: the displaced patch stays in storage', async () => {
		const browser = seed([
			[1, 1, 'Lead'],
			[1, 2, 'Pad'],
		]);
		const run = (window as any).cli.run;
		let puts = 0;
		const original = run.getMockImplementation();
		run.mockImplementation(async (args: string[]) => {
			if (args[0] === 'put-location' && ++puts === 2) throw new Error('no reply from device');
			return original(args);
		});

		expect(await browser.moveLocation(P(1, 1), P(1, 2), false)).toBe(false);

		expect(flash.get('patch-1-1')).toBe('Lead');
		expect(flash.get('patch-1-2')).toBe('Lead');
		expect(browser.storage.map((h) => h.name)).toEqual(['Pad']);
	});

	describe('undo/redo', () => {
		const history = async () => (await import('@/store/organizerHistory')).useOrganizerHistoryStore();

		it('undoes and redoes a move', async () => {
			const browser = seed([[1, 1, 'Lead']]);
			await browser.moveLocation(P(1, 1), P(2, 5), false);
			expect((await history()).undoLabel).toBe('Move "Lead" to 2-5');

			await browser.stepOrganizerHistory('undo');
			expect(flash).toEqual(new Map([['patch-1-1', 'Lead']]));
			expect(browser.synthPatches).toEqual([{ bank: 1, location: 1, name: 'Lead' }]);

			await browser.stepOrganizerHistory('redo');
			expect(flash).toEqual(new Map([['patch-2-5', 'Lead']]));
		});

		it('undoes a swap', async () => {
			const browser = seed([
				[1, 1, 'Lead'],
				[1, 2, 'Pad'],
			]);
			await browser.moveLocation(P(1, 1), P(1, 2), false);
			await browser.stepOrganizerHistory('undo');
			expect(flash.get('patch-1-1')).toBe('Lead');
			expect(flash.get('patch-1-2')).toBe('Pad');
			expect(browser.storage).toEqual([]);
		});

		it('changes the category of a cell by rewriting it, skips one already in it, and undoes it', async () => {
			const browser = seed([
				[1, 1, 'Lead'],
				[1, 2, 'Pad'],
			]);
			browser.upsertPatch(1, 2, 'patch', 'Pad', 'bass');
			const recategorize = vi.spyOn(browser, '_recategorize').mockResolvedValue();

			expect(await browser.setCategory(cells(P(1, 1), P(1, 2)), 3)).toBe(true);

			expect(recategorize).toHaveBeenCalledTimes(1);
			expect(calls.filter((c) => c[0] === 'put-location').map((c) => c.slice(1, 4))).toEqual([['patch', '1', '1']]);
			expect(browser.entryAt(P(1, 1))?.category).toBe('bass');
			expect((await history()).undoLabel).toBe('Set category of "Lead" to Bass');

			await browser.stepOrganizerHistory('undo');
			expect(browser.entryAt(P(1, 1))?.category).toBeUndefined();
		});

		it('undoes a delete: the patch was read into the history first', async () => {
			const browser = seed([
				[1, 1, 'Lead'],
				[1, 2, 'Pad'],
			]);
			await browser.clearLocations([P(1, 1), P(1, 2)]);
			expect(flash.size).toBe(0);

			await browser.stepOrganizerHistory('undo');
			expect(flash.get('patch-1-1')).toBe('Lead');
			expect(flash.get('patch-1-2')).toBe('Pad');
		});

		it('undoes a multi-move as one step', async () => {
			const browser = seed([
				[1, 1, 'Lead'],
				[1, 2, 'Pad'],
			]);
			await browser.placeMany(cells(P(1, 1), P(1, 2)), [P(3, 1), P(3, 2)], true);
			expect((await history()).undoStack).toHaveLength(1);

			await browser.stepOrganizerHistory('undo');
			expect(flash).toEqual(
				new Map([
					['patch-1-1', 'Lead'],
					['patch-1-2', 'Pad'],
				]),
			);
		});

		it('undoes copying to storage and deleting from storage', async () => {
			const browser = seed([[1, 1, 'Lead']]);
			await browser.toStorage([P(1, 1)]);
			expect(browser.storage.map((h) => h.name)).toEqual(['Lead']);

			await browser.stepOrganizerHistory('undo');
			expect(browser.storage).toEqual([]);
			await browser.stepOrganizerHistory('redo');
			expect(browser.storage.map((h) => h.name)).toEqual(['Lead']);

			await browser.removeStorage([browser.storage[0]]);
			expect(browser.storage).toEqual([]);
			await browser.stepOrganizerHistory('undo');
			expect(browser.storage.map((h) => h.name)).toEqual(['Lead']);
		});

		it('refuses to undo when a location changed outside the organizer, changing nothing', async () => {
			const browser = seed([[1, 1, 'Lead']]);
			await browser.moveLocation(P(1, 1), P(2, 5), false);
			// Someone else stores another patch at 2-5 (hardware panel, Patch Browser, other window).
			flash.set('patch-2-5', 'Other');
			browser.upsertPatch(2, 5, 'patch', 'Other');

			await browser.stepOrganizerHistory('undo');

			expect((await history()).conflict).toMatch(/2-5 has changed/);
			expect(flash).toEqual(new Map([['patch-2-5', 'Other']]));
			expect((await history()).undoStack).toHaveLength(1); // still there
		});

		it('a new action empties the redo stack; at most 50 steps are kept', async () => {
			const h = await history();
			const browser = seed([[1, 1, 'Lead']]);
			await browser.moveLocation(P(1, 1), P(1, 2), false);
			await browser.stepOrganizerHistory('undo');
			expect(h.canRedo).toBe(true);
			await browser.moveLocation(P(1, 1), P(1, 3), false);
			expect(h.canRedo).toBe(false);

			for (let i = 0; i < 60; i++) h.push({ label: `step ${i}`, changes: [] });
			expect(h.undoStack).toHaveLength(50);
			expect(h.undoLabel).toBe('step 59');
		});
	});
});

describe('ActionRecorder — storage file rewritten in place', () => {
	it('keeps a rewrite (exists before and after) when it has a copyAfter, and lists both copies', async () => {
		const { ActionRecorder, actionFiles } = await import('@/store/organizerHistory');
		const rec = new ActionRecorder('Set category');
		rec.storageTouched('/s/a.pch2', '/h/before.pch2', true, true, '/h/after.pch2');
		rec.storageTouched('/s/b.pch2', '/h/b.pch2', true, true); // touched but unchanged
		const action = rec.toAction()!;
		expect(action.changes).toEqual([
			{ type: 'storage', file: '/s/a.pch2', copy: '/h/before.pch2', existsBefore: true, existsAfter: true, copyAfter: '/h/after.pch2' },
		]);
		expect(actionFiles(action)).toEqual(['/h/before.pch2', '/h/after.pch2']);
	});
});
