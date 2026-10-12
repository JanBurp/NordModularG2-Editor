import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useHistoryStore } from '@/store/history';
import { useUiStore } from '@/store/ui';
import { useSlotEvents } from '../useSlotEvents';

beforeEach(() => {
	setActivePinia(createPinia());
});

// Loads a real, parseable fixture as {name, rawHex} for tests that need loadSlot()'s
// 'get-patch' response to survive a full reparse.
async function loadFixture(): Promise<{ name: string; rawHex: string }> {
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
	return { name, rawHex };
}

function seedVariation() {
	const store = useSlotsStore();
	store.slots['A'].variations = [
		{
			fx: {},
			voice: { 5: [10, 20] },
			patch: { morphDials: Array(8).fill(0), morphModes: Array(8).fill(0) } as any,
		},
	];
	return store;
}

describe('useSlotEvents — hardware-driven dirty marking', () => {
	it('param_change marks the target slot edited', async () => {
		const store = seedVariation();
		const { handleEvent } = useSlotEvents(() => {});
		expect(store.isSlotEdited('A')).toBe(false);

		await handleEvent({ type: 'param_change', slot: 'A', area: 'va', module: 5, param: 0, value: 42, variation: 0 });

		expect(store.slots['A'].variations![0].voice[5][0]).toBe(42);
		expect(store.isSlotEdited('A')).toBe(true);
	});

	it('patch_param marks the target slot edited (morph branch)', async () => {
		const store = seedVariation();
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'patch_param', slot: 'A', module: 1, param: 0, value: 99, variation: 0 });

		expect(store.slots['A'].variations![0].patch.morphDials[0]).toBe(99);
		expect(store.isSlotEdited('A')).toBe(true);
	});

	it('patch_name marks the target slot edited', async () => {
		const store = useSlotsStore();
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'patch_name', slot: 'A', name: 'Renamed' });

		expect(store.slots['A'].name).toBe('Renamed');
		expect(store.isSlotEdited('A')).toBe(true);
	});
});

function seedSeqNote() {
	const store = useSlotsStore();
	store.slots['A'].patch = {
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [{ index: 1, type: 121, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 37, lv: [], modes: [] }], cableList: [] },
		],
	} as any;
	store.slots['A'].variations = [{ fx: {}, voice: { 1: Array(37).fill(10) }, patch: {} as any }];
	return store;
}

// A Rnd/Clr triggered on the G2 itself is not answered with an editor randomize: the official editor
// only randomizes on its own button click. A patch that keeps triggering Rnd made the editor push
// its own steps after every G2 randomize, racing the G2's step echoes (duration test 2026-10-09).
describe('useSlotEvents — Rnd/Clr triggered on the G2', () => {
	it('takes the G2 step values without randomizing in the editor', async () => {
		const store = seedSeqNote();
		const spy = vi.spyOn(store, 'randomizeOrClearSeqSteps').mockResolvedValue(undefined);
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'param_change', slot: 'A', area: 'va', module: 1, param: 35, value: 1, variation: 0 });
		await handleEvent({ type: 'param_change', slot: 'A', area: 'va', module: 1, param: 0, value: 77, variation: 0 });

		expect(spy).not.toHaveBeenCalled();
		expect(store.slots['A'].variations![0].voice[1][0]).toBe(77);
	});
});

function seedModule() {
	const store = useSlotsStore();
	store.slots['A'].patch = {
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [{ index: 7, type: 5, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] }], cableList: [] },
		],
	} as any;
	return store;
}

describe('useSlotEvents — selected_param (hardware panel cursor) sync', () => {
	it('applies the hardware cursor to the focused slot when the module exists', async () => {
		seedModule();
		const uiStore = useUiStore();
		uiStore.slotInFocus = 'A';
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'selected_param', slot: 'A', area: 'va', module: 7, param: 3 });

		expect(uiStore.selectedModules).toEqual([7]);
		expect(uiStore.selectedParam).toEqual({ moduleId: 7, paramIndex: 3 });
	});

	it('ignores events for a slot that is not currently in focus', async () => {
		seedModule();
		const uiStore = useUiStore();
		uiStore.slotInFocus = 'A';
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'selected_param', slot: 'B', area: 'va', module: 7, param: 3 });

		expect(uiStore.selectedModules).toEqual([]);
		expect(uiStore.selectedParam).toBeNull();
	});

	it("ignores the 'patch' (Master Clock) context — no on-canvas equivalent", async () => {
		seedModule();
		const uiStore = useUiStore();
		uiStore.slotInFocus = 'A';
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'selected_param', slot: 'A', area: 'patch', module: 1, param: 0 });

		expect(uiStore.selectedModules).toEqual([]);
		expect(uiStore.selectedParam).toBeNull();
	});

	it('ignores a stale event referencing a module that no longer exists', async () => {
		seedModule();
		const uiStore = useUiStore();
		uiStore.slotInFocus = 'A';
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'selected_param', slot: 'A', area: 'va', module: 99, param: 0 });

		expect(uiStore.selectedModules).toEqual([]);
		expect(uiStore.selectedParam).toBeNull();
	});
});

describe('useSlotEvents — hardware-echo resync preserves undo/dirty state', () => {
	it('patch_version_change followed by resources_used reloads with preserveHistory (undo/dirty survive)', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();
		const { handleEvent } = useSlotEvents(() => {});

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		// Simulate the state left behind right after a real add/move/delete-module action:
		// dirty, one undo entry recorded, rawHex nulled by that action's own _markSlotDirty.
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;
		(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(JSON.stringify({ slot: 'A', name, data: rawHex })) } };

		await handleEvent({ type: 'patch_version_change', slot: 'A', version: 5 });
		await handleEvent({ type: 'resources_used', slot: 'A', data: Array(29).fill(0) });

		expect(store.isSlotEdited('A')).toBe(true);
		expect(hist.canUndo('A')).toBe(true);
	});
	it('hardware patch_description updates voices/mode in place without a reload', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const { handleEvent } = useSlotEvents(() => {});
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		const run = vi.fn();
		(globalThis as any).window = { cli: { run } };

		// Captured from a G2: 18 voices (raw 17), legato
		await handleEvent({ type: 'patch_version_change', slot: 'A', version: 0 });
		await handleEvent({ type: 'patch_description', slot: 'A', data: [0, 15, 0, 236, 0, 0, 1, 0, 0, 36, 65, 122, 95, 224, 16, 0, 0] });
		await handleEvent({ type: 'resources_used', slot: 'A', data: Array(29).fill(0) });

		expect(store.slots['A'].patch!.description!.voices).toBe(17);
		expect(store.slots['A'].patch!.description!.monopoly).toBe(2);
		expect(run).not.toHaveBeenCalled();
	});
});
