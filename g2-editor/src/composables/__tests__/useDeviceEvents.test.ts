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

describe('useDeviceEvents — rearm snapshot vs. local edits', () => {
	const snapshot = {
		type: 'synth_settings_update',
		mode: 'Patch',
		patches: [
			{ slot: 'A', data: 'aa' },
			{ slot: 'B', data: 'bb' },
		],
	};

	it('re-fetches a slot edited after version_update instead of applying the stale snapshot', async () => {
		const slots = useSlotsStore();
		const load = vi.spyOn(slots, 'loadSlot').mockResolvedValue(null);
		const apply = vi.spyOn(slots, '_applyPatchOutput').mockResolvedValue(undefined as any);
		const { handleEvent } = useDeviceEvents(() => {});

		await handleEvent({ type: 'version_update', scope: 'all_slots' });
		slots._markSlotDirty('B'); // optimistic add-module while the daemon was taking the snapshot
		await handleEvent(snapshot);

		expect(load).toHaveBeenCalledWith('B', true);
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply.mock.calls[0][0]).toBe('A');
	});

	it('applies the whole snapshot when nothing was edited in between', async () => {
		const slots = useSlotsStore();
		const load = vi.spyOn(slots, 'loadSlot').mockResolvedValue(null);
		const apply = vi.spyOn(slots, '_applyPatchOutput').mockResolvedValue(undefined as any);
		const { handleEvent } = useDeviceEvents(() => {});

		slots._markSlotDirty('B'); // before the rearm: already part of the snapshot
		await handleEvent({ type: 'version_update', scope: 'all_slots' });
		await handleEvent(snapshot);

		expect(load).not.toHaveBeenCalled();
		expect(apply.mock.calls.map((c) => c[0])).toEqual(['A', 'B']);
	});
});
