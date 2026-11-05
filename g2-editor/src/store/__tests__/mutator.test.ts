import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useMutatorStore } from '@/store/mutator';
import { useHistoryStore } from '@/store/history';
import { useDeviceStore, DeviceStatus } from '@/store/device';
import { useUiStore } from '@/store/ui';
import { MUTATOR_VARIATION } from '@/types/patch';
import { usePatchAdjusterStore } from '@/store/patchAdjuster';
import * as M from '@/renderer/mutator';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined), runBatch: vi.fn().mockResolvedValue([]) } };
});

async function loadAnalogue(): Promise<void> {
	const fs = await import('fs');
	const path = await import('path');
	const { fileURLToPath } = await import('url');
	const dirname = fileURLToPath(new URL('.', import.meta.url));
	const bytes = new Uint8Array(fs.readFileSync(path.join(dirname, '../../../../test-patches/Analogue NL2.pch2')));
	let ofs = 0;
	while (bytes[ofs] !== 0) ofs++;
	const rawHex = Array.from(bytes.slice(ofs + 3), (b) => b.toString(16).padStart(2, '0')).join('');
	await useSlotsStore()._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'Analogue', data: rawHex }));
	useUiStore().setSlotInFocus('A');
	useDeviceStore().status = DeviceStatus.Connected;
}

describe('mutator store', () => {
	it('mutate fills six children from the mother and auditions child 1 in the mutator variation', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		await m.mutate({ kind: 'variation', index: 0 });
		expect(m.current.mother).not.toBeNull();
		expect(m.current.children.every((c) => c !== null)).toBe(true);
		expect(m.focus).toEqual({ kind: 'child', index: 0 });
		expect(useUiStore().variation).toBe(MUTATOR_VARIATION);
		// one param dump (patch settings, VA, FX, morphs) holding only the mutator variation
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['send-sections', 'A', expect.any(Array)]);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['variation', String(MUTATOR_VARIATION + 1), 'A']);
		// auditioning is not a patch edit, and the saved active variation is untouched
		expect(useSlotsStore().slots.A.patch?.description?.variation).not.toBe(MUTATOR_VARIATION);
	});

	it('re-centres the Patch Adjuster when a new sound gets the focus', async () => {
		await loadAnalogue();
		const adjuster = usePatchAdjusterStore();
		adjuster.knobs.attack = 100;
		await useMutatorStore().randomize();
		expect(adjuster.knobs.attack).toBe(64);
	});

	it('INIT into the auditioned mutator variation is a param dump, not copy-variation (G2 knows 0-8 only)', async () => {
		await loadAnalogue();
		await useMutatorStore().mutate({ kind: 'variation', index: 0 });
		const run = (globalThis as any).window.cli.run;
		run.mockClear();
		const slots = useSlotsStore();
		await slots.copyVariation(8, MUTATOR_VARIATION);
		expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['copy-variation']));
		expect(run).toHaveBeenCalledWith(['send-sections', 'A', expect.any(Array)]);
		expect(slots.slots.A.variations![MUTATOR_VARIATION]).toEqual(slots.slots.A.variations![8]);
	});

	it('"Selected" limits Randomize to the selected modules', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		const { patch, variations } = useSlotsStore().slots.A;
		const src = variations![0];
		// a voice module with a mutable param
		const mod = patch!.areas[1].modules.find((mod) =>
			src.voice[mod.index]?.some((_, p) => M.isEnabled(mod.type, mod.mutaLock === 1, p, m.current.lockMask, m.current.soloMask)),
		)!;
		const id = String(mod.index);
		m.toggleSelectedOnly();
		await m.randomize(); // nothing selected: blocked
		expect(m.current.children.every((c) => c === null)).toBe(true);
		useUiStore().selectModules([Number(id)], 'va');
		await m.randomize();
		const floored = m.current.children.map((c) => c && M.variationFromGenome(c));
		for (const child of floored) {
			expect(child!.fx).toEqual(src.fx);
			for (const [other, vals] of Object.entries(src.voice)) if (other !== id) expect(child!.voice[Number(other)]).toEqual(vals);
		}
		expect(floored.some((c) => JSON.stringify(c!.voice[Number(id)]) !== JSON.stringify(src.voice[Number(id)]))).toBe(true);
	});

	it('undo restores the boxes', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		await m.mutate({ kind: 'variation', index: 0 });
		await useSlotsStore().undo();
		expect(m.current.mother).toBeNull();
		expect(m.current.children.every((c) => c === null)).toBe(true);
	});

	it('focus changes are undo steps, so undoing an edit never lands in another box', async () => {
		await loadAnalogue();
		const slots = useSlotsStore();
		const m = useMutatorStore();
		await m.mutate({ kind: 'variation', index: 0 }); // auditions child 1
		const [id, vals] = Object.entries(slots.slots.A.variations![MUTATOR_VARIATION].voice)[0];
		const orig = vals[0];
		const edited = (orig + 1) % 128;
		await slots.setParam(Number(id), 0, edited, MUTATOR_VARIATION, 'voice');
		await m.focusBox({ kind: 'child', index: 1 });
		const child2 = JSON.stringify(slots.slots.A.variations![MUTATOR_VARIATION]);

		await slots.undo(); // back to child 1, edit still there
		expect(m.focus).toEqual({ kind: 'child', index: 0 });
		expect(slots.slots.A.variations![MUTATOR_VARIATION].voice[Number(id)][0]).toBe(edited);
		await slots.undo(); // the edit itself
		expect(slots.slots.A.variations![MUTATOR_VARIATION].voice[Number(id)][0]).toBe(orig);
		await slots.redo();
		await slots.redo();
		expect(m.focus).toEqual({ kind: 'child', index: 1 });
		expect(JSON.stringify(slots.slots.A.variations![MUTATOR_VARIATION])).toBe(child2);
	});

	it('selecting a variation is an undo step that brings back the focused box', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		await m.mutate({ kind: 'variation', index: 0 });
		await m.focusBox({ kind: 'variation', index: 2 });
		expect(useUiStore().variation).toBe(2);
		await useSlotsStore().undo();
		expect(useUiStore().variation).toBe(MUTATOR_VARIATION);
		expect(m.focus).toEqual({ kind: 'child', index: 0 });
	});

	it('re-focusing the focused box or variation adds no undo step', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		const hist = useHistoryStore();
		await m.focusBox({ kind: 'variation', index: useUiStore().variation });
		expect(hist.canUndo('A')).toBe(false);
		await m.mutate({ kind: 'variation', index: 0 });
		const depth = hist.slots.A.past.length;
		await m.focusBox({ kind: 'child', index: 0 });
		expect(hist.slots.A.past.length).toBe(depth);
	});

	it('storage → storage drag moves the sound', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		await m.copy({ kind: 'variation', index: 0 }, { kind: 'storage', index: 0 });
		await m.copy({ kind: 'storage', index: 0 }, { kind: 'storage', index: 5 });
		expect(m.current.storage[0]).toBeNull();
		expect(m.current.storage[5]).not.toBeNull();
	});

	it('"v" copies a storage row into the variations as one undo step', async () => {
		await loadAnalogue();
		const slots = useSlotsStore();
		const m = useMutatorStore();
		const original = JSON.stringify(slots.slots.A.variations![2]);
		await m.mutate({ kind: 'variation', index: 0 });
		await m.copy({ kind: 'child', index: 3 }, { kind: 'storage', index: 2 });
		await m.rowToVariations(0);
		expect(JSON.stringify(slots.slots.A.variations![2])).not.toBe(original);
		await slots.undo();
		expect(JSON.stringify(slots.slots.A.variations![2])).toBe(original);
	});

	it('is reset when the slot gets a new patch', async () => {
		await loadAnalogue();
		const m = useMutatorStore();
		await m.mutate({ kind: 'variation', index: 0 });
		useHistoryStore().clearHistory('A');
		expect(m.current.mother).toBeNull();
	});
});
