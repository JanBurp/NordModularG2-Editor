import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useSlotsStore } from '@/store/slots';
import type { SlotLabel } from '@/store/slots';
import { usePatchClipboard } from '../usePatchClipboard';

function makeModule(index: number, overrides: Record<string, unknown> = {}) {
	return { index, type: 1, horiz: 0, vert: 0, lv: [0, 0], modes: [0], ...overrides };
}

// getAreaModules/getAreaCables are Pinia getters (not spy-able directly), so tests seed the
// underlying patch state they read from instead.
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
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	};
});

describe('usePatchClipboard — copy/cut writes through the OS clipboard', () => {
	it('copySelection writes the ClipboardEntry via window.electronAPI.clipboard.write', () => {
		const uiStore = useUiStore();
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(0), makeModule(1)]);
		uiStore.selectModules([0, 1], 'va');

		const { copySelection } = usePatchClipboard();
		copySelection();

		expect(window.electronAPI.clipboard.write).toHaveBeenCalledTimes(1);
		const written = (window.electronAPI.clipboard.write as any).mock.calls[0][0];
		expect(written.modules).toHaveLength(2);
		expect(written.area).toBe('va');
		expect(uiStore.clipboard).toEqual(written);
	});

	it('copySelection does nothing when there is no selection', () => {
		useUiStore().selectModules([], 'va');
		const { copySelection } = usePatchClipboard();
		copySelection();
		expect(window.electronAPI.clipboard.write).not.toHaveBeenCalled();
	});
});

describe('usePatchClipboard — pasteClipboard/pasteParams prefer the OS clipboard', () => {
	it('pasteClipboard reads via clipboard.read() and no-ops when it resolves null and there is no local fallback', async () => {
		(window.electronAPI.clipboard.read as any).mockResolvedValue(null);
		const slotsStore = useSlotsStore();
		const pasteSpy = vi.spyOn(slotsStore, 'paste').mockResolvedValue(undefined as any);

		const { pasteClipboard } = usePatchClipboard();
		await pasteClipboard();

		expect(window.electronAPI.clipboard.read).toHaveBeenCalledTimes(1);
		expect(pasteSpy).not.toHaveBeenCalled();
	});

	it('pasteClipboard applies the entry returned by clipboard.read() even though uiStore.clipboard is empty (cross-window copy)', async () => {
		const entry = {
			modules: [makeModule(0, { horiz: 3, vert: 3 })],
			cables: [],
			area: 'va' as const,
			copiedVariation: 0,
		};
		(window.electronAPI.clipboard.read as any).mockResolvedValue(entry);
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, []);
		const pasteSpy = vi.spyOn(slotsStore, 'paste').mockResolvedValue(undefined as any);
		const nmg2mods = await import('@/renderer/nmg2mods');
		vi.spyOn(nmg2mods, 'getModule').mockReturnValue({ height: 2 } as any);

		const { pasteClipboard } = usePatchClipboard();
		await pasteClipboard();

		expect(pasteSpy).toHaveBeenCalledTimes(1);
	});

	it('pasteParams reads via clipboard.read() and no-ops when it resolves null', async () => {
		(window.electronAPI.clipboard.read as any).mockResolvedValue(null);
		const slotsStore = useSlotsStore();
		const pasteParamsSpy = vi.spyOn(slotsStore, 'pasteParams').mockResolvedValue(undefined as any);

		const { pasteParams } = usePatchClipboard();
		await pasteParams();

		expect(pasteParamsSpy).not.toHaveBeenCalled();
	});
});

describe('usePatchClipboard — hasClipboard', () => {
	it('starts false when uiStore.clipboard is empty', () => {
		const { hasClipboard } = usePatchClipboard();
		expect(hasClipboard.value).toBe(false);
	});

	it('becomes true immediately after a local copySelection()', () => {
		const slotsStore = useSlotsStore();
		seedArea(slotsStore, 'A', 1, [makeModule(0)]);
		useUiStore().selectModules([0], 'va');

		const { copySelection, hasClipboard } = usePatchClipboard();
		expect(hasClipboard.value).toBe(false);
		copySelection();
		expect(hasClipboard.value).toBe(true);
	});

	it('registers a window "focus" listener that refreshes from clipboard.read()', () => {
		usePatchClipboard();
		expect(window.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
	});

	it('refreshes to true on a simulated window-focus event when another window copied something', async () => {
		(window.electronAPI.clipboard.read as any).mockResolvedValue({
			modules: [makeModule(0)],
			cables: [],
			area: 'va',
			copiedVariation: 0,
		});

		const { hasClipboard } = usePatchClipboard();
		expect(hasClipboard.value).toBe(false);

		const focusHandler = (window.addEventListener as any).mock.calls.find((c: any[]) => c[0] === 'focus')[1];
		await focusHandler();

		expect(hasClipboard.value).toBe(true);
	});
});
