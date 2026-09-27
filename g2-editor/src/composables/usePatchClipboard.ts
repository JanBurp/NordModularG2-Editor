import type { Cable } from '@/renderer/cableRenderer';
import type { ClipboardEntry } from '@/types/patch';
import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { areaConfig, buildCloneEntries, buildPasteParamsPairs, resolvePasteRowOffset, resolveSelectionArea } from '../store/slotHelpers';
import { usePatchOperations } from './usePatchOperations';

// Copy/cut write the entry through the OS clipboard (window.electronAPI.clipboard), not just
// uiStore.clipboard, so paste works across windows too — each connected G2 gets its own
// Electron BrowserWindow/renderer process, so a plain Pinia field is invisible to the others.
async function readClipboardEntry(uiStore: ReturnType<typeof useUiStore>): Promise<ClipboardEntry | null> {
	try {
		const entry = (await window.electronAPI?.clipboard?.read()) as ClipboardEntry | null | undefined;
		if (entry && Array.isArray(entry.modules)) return entry;
	} catch {
		// OS clipboard unavailable (e.g. non-Electron/test environment) — fall back below
	}
	return uiStore.clipboard;
}

export function usePatchClipboard(areaGetter?: () => 'voice' | 'fx') {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { deleteSelection } = usePatchOperations(areaGetter);

	const getSourceArea = areaGetter ?? (() => resolveSelectionArea(uiStore));

	const hasClipboard = ref(uiStore.clipboard !== null && uiStore.clipboard.modules.length > 0);

	async function refreshHasClipboard(): Promise<void> {
		const entry = await readClipboardEntry(uiStore);
		hasClipboard.value = !!entry && entry.modules.length > 0;
	}

	// Covers "copy in window A, click into window B, then try to paste" — the realistic
	// cross-window usage pattern — without needing an OS clipboard-changed watcher.
	if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
		window.addEventListener('focus', refreshHasClipboard);
	}

	function copySelection(): void {
		const selectedIds = new Set(uiStore.selectedModules);
		if (selectedIds.size === 0) return;

		const area = getSourceArea();
		const { areaIdx, location: areaKey } = areaConfig(area);
		const slot = uiStore.slotInFocus;

		const modules = slotsStore
			.getAreaModules(slot, areaIdx)
			.filter((m: any) => selectedIds.has(m.index as number))
			.map((m: any) => ({
				...m,
				lv: [...m.lv],
				modes: [...m.modes],
				paramLabels: m.paramLabels ? m.paramLabels.map((pl: any) => ({ ...pl, labels: [...pl.labels] })) : undefined,
			}));

		const cables = slotsStore
			.getAreaCables(slot, areaIdx)
			.filter((c: any) => selectedIds.has(c.smod as number) && selectedIds.has(c.dmod as number))
			.map((c: any) => ({ ...c }));

		const entry: ClipboardEntry = { modules, cables, area: areaKey, copiedVariation: uiStore.variation };
		uiStore.clipboard = entry;
		hasClipboard.value = entry.modules.length > 0;
		window.electronAPI?.clipboard?.write(entry).catch((err: unknown) => console.error('clipboard write failed:', err));
	}

	async function cutSelection(): Promise<void> {
		copySelection();
		await deleteSelection();
	}

	async function pasteClipboard(): Promise<void> {
		const clipboard = await readClipboardEntry(uiStore);
		if (!clipboard || clipboard.modules.length === 0) return;

		// Destination area: use mouse position's area if known, else active area
		const mousePos = uiStore.lastMousePos;
		const destAreaKey: 'va' | 'fx' = mousePos ? mousePos.area : uiStore.activeArea === 1 ? 'va' : 'fx';
		const area: 'voice' | 'fx' = destAreaKey === 'va' ? 'voice' : 'fx';
		const { areaIdx } = areaConfig(area);

		// Compute target top-left from mouse or fall back to +2 offset from clipboard origin
		const minCol = Math.min(...clipboard.modules.map((m) => m.horiz));
		const minRow = Math.min(...clipboard.modules.map((m) => m.vert));
		const targetCol = mousePos ? mousePos.col : minCol + 2;
		const targetRow = mousePos ? mousePos.row : minRow + 2;
		const dCol = targetCol - minCol;

		const { getModule } = await import('../renderer/nmg2mods');
		const moduleRects = clipboard.modules.map((m) => ({ vert: m.vert, height: getModule(m.type)?.height ?? 2 }));
		const dRow = resolvePasteRowOffset(moduleRects, dCol, targetRow - minRow);

		// Generate new IDs against the destination area
		const existingIds = slotsStore.getAreaModules(uiStore.slotInFocus, areaIdx).map((m: any) => m.index as number);
		const { entries, remappedCables } = buildCloneEntries(clipboard.modules, clipboard.cables, existingIds, dCol, dRow);
		await slotsStore.paste(entries, remappedCables, area);

		uiStore.selectModules(
			entries.map((e) => e.newId),
			destAreaKey,
		);
	}

	// Targets: the current live selection if one exists (explicit "paste onto a different module"),
	// else fall back to pasting each copied module back onto a module with the same id (covers
	// "copy in one Variation/slot, Paste Params in another" without needing to reselect).
	async function pasteParams(): Promise<void> {
		const clipboard = await readClipboardEntry(uiStore);
		if (!clipboard || clipboard.modules.length === 0) return;
		const area = getSourceArea();
		const currentModules = slotsStore.getAreaModules(uiStore.slotInFocus, areaConfig(area).areaIdx);
		const targetIds = uiStore.selectedModules.length > 0 ? uiStore.selectedModules : clipboard.modules.map((m) => m.index);
		const pairs = buildPasteParamsPairs(clipboard.modules, clipboard.copiedVariation, targetIds, currentModules);
		if (pairs.length === 0) return;
		await slotsStore.pasteParams(pairs, uiStore.variation, area);
	}

	return { copySelection, cutSelection, pasteClipboard, pasteParams, hasClipboard };
}
