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

	it('no-ops when neither the OS clipboard nor uiStore.clipboard has an entry', async () => {
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(9)]);
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { handlePasteParams } = usePatchOperations();
		await handlePasteParams(9);

		expect(pasteParamsSpy).not.toHaveBeenCalled();
	});
});
