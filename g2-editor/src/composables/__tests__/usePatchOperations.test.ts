import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import type { SlotLabel } from '@/store/slots';
import { usePatchOperations } from '../usePatchOperations';

function makeModule(index: number, overrides: Record<string, unknown> = {}) {
	return { index, type: 1, horiz: 0, vert: 0, lv: [0, 0], modes: [0], pcnt: 2, ...overrides };
}

function seedArea(slotsStore: ReturnType<typeof useSlotsStore>, slot: SlotLabel, areaIdx: 0 | 1, modules: any[], cableList: any[] = []) {
	if (!slotsStore.slots[slot].patch) {
		slotsStore.slots[slot].patch = {
			areas: [
				{ name: '', modules: [], cableList: [], paramaterDataOfs: 0 },
				{ name: '', modules: [], cableList: [], paramaterDataOfs: 0 },
			],
		} as any;
	}
	slotsStore.slots[slot].patch!.areas[areaIdx].modules = modules;
	slotsStore.slots[slot].patch!.areas[areaIdx].cableList = cableList;
}

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = {
		cli: { run: vi.fn().mockResolvedValue(undefined) },
		electronAPI: {
			clipboard: {
				write: vi.fn().mockResolvedValue(undefined),
				read: vi.fn().mockResolvedValue(null),
			},
		},
	};
});

// handlePasteParams shares its clipboard read (OS clipboard, fallback to uiStore.clipboard)
// with usePatchClipboard.ts's readClipboardEntry — this covers the same cross-window paste
// path that composable already has direct tests for.
describe('usePatchOperations — handlePasteParams', () => {
	it('reads the OS clipboard first and pastes even though uiStore.clipboard is empty (cross-window copy)', async () => {
		(window.electronAPI.clipboard.read as any).mockResolvedValue({
			modules: [makeModule(5)],
			cables: [],
			area: 'va',
			copiedVariation: 0,
		});
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(9)]);
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { handlePasteParams } = usePatchOperations();
		await handlePasteParams(9);

		expect(pasteParamsSpy).toHaveBeenCalledTimes(1);
	});

	it('falls back to uiStore.clipboard when the OS clipboard read resolves null', async () => {
		const uiStore = useUiStore();
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(9)]);
		uiStore.clipboard = { modules: [makeModule(5)], cables: [], area: 'va', copiedVariation: 0 } as any;
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { handlePasteParams } = usePatchOperations();
		await handlePasteParams(9);

		expect(pasteParamsSpy).toHaveBeenCalledTimes(1);
	});

	it('does not paste when the target module type differs from the copied one', async () => {
		const uiStore = useUiStore();
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(9, { type: 2 })]);
		uiStore.clipboard = { modules: [makeModule(5)], cables: [], area: 'va', copiedVariation: 0 } as any;
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { handlePasteParams } = usePatchOperations();
		await handlePasteParams(9);

		expect(pasteParamsSpy).not.toHaveBeenCalled();
	});

	it('no-ops when neither the OS clipboard nor uiStore.clipboard has an entry', async () => {
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(9)]);
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { handlePasteParams } = usePatchOperations();
		await handlePasteParams(9);

		expect(pasteParamsSpy).not.toHaveBeenCalled();
	});
	it('ignores a selection in the other area that holds the same module index', async () => {
		const uiStore = useUiStore();
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(1), makeModule(4)]);
		seedArea(slotsStore, 'A', 0, [makeModule(1), makeModule(4)]);
		uiStore.selectModules([1, 4], 'fx');
		uiStore.clipboard = { modules: [makeModule(5)], cables: [], area: 'va', copiedVariation: 0 } as any;
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { handlePasteParams } = usePatchOperations(() => 'voice');
		await handlePasteParams(1); // VA module 1, while FX 1 + 4 are selected

		expect(pasteParamsSpy).toHaveBeenCalledWith([expect.objectContaining({ targetId: 1 })], expect.anything(), 'voice');
	});
});

describe('usePatchOperations — handleModuleMove (drag copy)', () => {
	it('copies the morph assignments of the dragged modules along with them', async () => {
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(4)]);
		const morph = { groupIndex: 2, location: 1, moduleIndex: 4, paramIndex: 1, range: -30 };
		slotsStore.slots['A'].variations = [
			{ fx: {}, voice: {}, patch: { morphAssignments: [morph] } },
			{ fx: {}, voice: {}, patch: { morphAssignments: [] } },
		] as any;
		const pasteSpy = vi.spyOn(slotsStore, 'paste').mockResolvedValue(undefined as any);

		const { handleModuleMove } = usePatchOperations(() => 'voice');
		await handleModuleMove({ indices: [4], dCol: 0, dRow: 5, anchorIndex: 4, isCopy: true });

		expect(pasteSpy).toHaveBeenCalledWith([expect.objectContaining({ src: expect.objectContaining({ index: 4 }) })], [], 'voice', [[morph], []]);
	});
});

describe('usePatchOperations — deleteUnusedCables', () => {
	it('removes only cables whose smod/dmod no longer exists in that area, across both voice and fx', async () => {
		const slotsStore = useSlotsStore();
		const validCable = { smod: 1, scon: 0, dmod: 2, dcon: 0, dir: 1, colour: 0 };
		const orphanedDest = { smod: 1, scon: 1, dmod: 99, dcon: 0, dir: 1, colour: 0 };
		const orphanedSrc = { smod: 88, scon: 0, dmod: 3, dcon: 0, dir: 1, colour: 0 };
		seedArea(slotsStore, 'A', 1, [makeModule(1), makeModule(2)], [validCable, orphanedDest]);
		seedArea(slotsStore, 'A', 0, [makeModule(3)], [orphanedSrc]);
		const deleteSelectionSpy = vi.spyOn(slotsStore, 'deleteSelection').mockResolvedValue(undefined as any);

		const { deleteUnusedCables } = usePatchOperations();
		await deleteUnusedCables();

		expect(deleteSelectionSpy).toHaveBeenCalledTimes(2);
		expect(deleteSelectionSpy).toHaveBeenCalledWith([], [orphanedDest], 'voice', expect.anything(), expect.anything());
		expect(deleteSelectionSpy).toHaveBeenCalledWith([], [orphanedSrc], 'fx', expect.anything(), expect.anything());
	});

	it('does nothing when every cable references an existing module', async () => {
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(1), makeModule(2)], [{ smod: 1, scon: 0, dmod: 2, dcon: 0, dir: 1, colour: 0 }]);
		seedArea(slotsStore, 'A', 0, [], []);
		const deleteSelectionSpy = vi.spyOn(slotsStore, 'deleteSelection').mockResolvedValue(undefined as any);

		const { deleteUnusedCables } = usePatchOperations();
		await deleteUnusedCables();

		expect(deleteSelectionSpy).not.toHaveBeenCalled();
	});

	it('removes auto-colored white cables (no signal driving them) but keeps a deliberately user-painted white cable', async () => {
		const slotsStore = useSlotsStore();
		const validCable = { smod: 1, scon: 0, dmod: 2, dcon: 0, dir: 1, colour: 0 };
		const autoWhiteOrphan = { smod: 3, scon: 0, dmod: 4, dcon: 0, dir: 0, colour: 6 }; // no userColour — daisy-chain link with no driving output
		const userPaintedWhite = { smod: 1, scon: 1, dmod: 5, dcon: 0, dir: 1, colour: 6, userColour: 6 }; // deliberate choice on a real cable
		seedArea(
			slotsStore,
			'A',
			1,
			[makeModule(1), makeModule(2), makeModule(3), makeModule(4), makeModule(5)],
			[validCable, autoWhiteOrphan, userPaintedWhite],
		);
		seedArea(slotsStore, 'A', 0, [], []);
		const deleteSelectionSpy = vi.spyOn(slotsStore, 'deleteSelection').mockResolvedValue(undefined as any);

		const { deleteUnusedCables } = usePatchOperations();
		await deleteUnusedCables();

		expect(deleteSelectionSpy).toHaveBeenCalledTimes(1);
		expect(deleteSelectionSpy).toHaveBeenCalledWith([], [autoWhiteOrphan], 'voice', expect.anything(), expect.anything());
	});
});
