import type { ClipboardEntry } from '@/types/patch';
import { computed, getCurrentInstance, onUnmounted } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import {
	AREA_FULL_MESSAGE,
	areaConfig,
	buildCloneEntries,
	buildPasteParamsPairs,
	PASTE_PARAMS_MISMATCH,
	resolvePasteRowOffset,
	resolveSelectionArea,
} from '../store/slotHelpers';
import { usePatchOperations } from './usePatchOperations';
import { showToast } from './useToast';

// Copy/cut write the entry through the OS clipboard (window.electronAPI.clipboard), not just
// uiStore.clipboard, so paste works across windows too — each connected G2 gets its own
// Electron BrowserWindow/renderer process, so a plain Pinia field is invisible to the others.
export async function readClipboardEntry(uiStore: ReturnType<typeof useUiStore>): Promise<ClipboardEntry | null> {
	try {
		const entry = (await window.electronAPI?.clipboard?.read()) as ClipboardEntry | null | undefined;
		if (entry && Array.isArray(entry.modules)) return entry;
	} catch {
		// OS clipboard unavailable (e.g. non-Electron/test environment) — fall back below
	}
	return uiStore.clipboard;
}

// The selected modules of `area` with their cables among themselves and their morphs. Shared by Copy and Save as Block.
export function selectionEntry(area: 'voice' | 'fx'): ClipboardEntry | null {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const selectedIds = new Set(uiStore.selectedModules);
	if (selectedIds.size === 0) return null;

	const { areaIdx, location: areaKey } = areaConfig(area);
	const slot = uiStore.slotInFocus;

	const { modules, morphs } = slotsStore.snapshotModulesForCopy(slot, areaIdx, [...selectedIds]);

	const cables = slotsStore
		.getAreaCables(slot, areaIdx)
		.filter((c: any) => selectedIds.has(c.smod as number) && selectedIds.has(c.dmod as number))
		.map((c: any) => ({ ...c }));

	return { modules, cables, area: areaKey, copiedVariation: uiStore.variation, morphs };
}

// Shared by Paste and building-block insert: adds `entry`'s modules with their top-left at `target`, else at
// the mouse position, else 2 columns/rows from where they were copied.
export async function insertEntry(entry: ClipboardEntry, target?: { col: number; row: number; area: 'va' | 'fx' }): Promise<void> {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	if (entry.modules.length === 0) return;

	// Destination area: use the target's or mouse position's area if known, else active area
	const pos = target ?? uiStore.lastMousePos;
	const destAreaKey: 'va' | 'fx' = pos ? pos.area : uiStore.activeArea === 1 ? 'va' : 'fx';
	const area: 'voice' | 'fx' = destAreaKey === 'va' ? 'voice' : 'fx';
	const { areaIdx } = areaConfig(area);

	// Leave out modules that can't go in the destination area (Fx-In in the voice area), and their cables
	const { getModule, isValidInArea } = await import('../renderer/nmg2mods');
	const modules = entry.modules.filter((m) => isValidInArea(m.type, area));
	if (modules.length < entry.modules.length) showToast('Fx Input only works in the FX area — left out.');
	if (modules.length === 0) return;
	const kept = new Set(modules.map((m) => m.index));
	const cables = entry.cables.filter((c) => kept.has(c.smod) && kept.has(c.dmod));

	// Compute target top-left from the position or fall back to +2 offset from the entry's origin
	const minCol = Math.min(...modules.map((m) => m.horiz));
	const minRow = Math.min(...modules.map((m) => m.vert));
	const targetCol = pos ? pos.col : minCol + 2;
	const targetRow = pos ? pos.row : minRow + 2;
	const dCol = targetCol - minCol;

	const moduleRects = modules.map((m) => ({ vert: m.vert, height: getModule(m.type)?.height ?? 2 }));
	const dRow = resolvePasteRowOffset(moduleRects, dCol, targetRow - minRow);

	// Generate new IDs against the destination area
	const existingIds = slotsStore.getAreaModules(uiStore.slotInFocus, areaIdx).map((m: any) => m.index as number);
	const clone = buildCloneEntries(modules, cables, existingIds, dCol, dRow);
	if (!clone) return showToast(AREA_FULL_MESSAGE);
	const { entries, remappedCables } = clone;
	await slotsStore.paste(entries, remappedCables, area, entry.morphs);

	uiStore.selectModules(
		entries.map((e) => e.newId),
		destAreaKey,
	);
}

export function usePatchClipboard(areaGetter?: () => 'voice' | 'fx') {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { deleteSelection } = usePatchOperations(areaGetter);

	const getSourceArea = areaGetter ?? (() => resolveSelectionArea(uiStore));

	uiStore.clipboardTypes = uiStore.clipboard?.modules.map((m) => m.type) ?? [];
	const hasClipboard = computed(() => uiStore.hasClipboard);

	async function refreshHasClipboard(): Promise<void> {
		const entry = await readClipboardEntry(uiStore);
		uiStore.clipboardTypes = entry?.modules.map((m) => m.type) ?? [];
	}

	// Covers "copy in window A, click into window B, then try to paste" — the realistic
	// cross-window usage pattern — without needing an OS clipboard-changed watcher.
	// Also read once now: a freshly opened window already has focus, so no focus event follows.
	if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
		void refreshHasClipboard();
		window.addEventListener('focus', refreshHasClipboard);
		if (getCurrentInstance()) {
			onUnmounted(() => window.removeEventListener('focus', refreshHasClipboard));
		}
	}

	function copySelection(): void {
		const entry = selectionEntry(getSourceArea());
		if (!entry) return;
		uiStore.clipboard = entry;
		uiStore.clipboardTypes = entry.modules.map((m) => m.type);
		window.electronAPI?.clipboard?.write(entry).catch((err: unknown) => console.error('clipboard write failed:', err));
	}

	async function cutSelection(): Promise<void> {
		copySelection();
		await deleteSelection();
	}

	async function pasteClipboard(): Promise<void> {
		const clipboard = await readClipboardEntry(uiStore);
		if (clipboard) await insertEntry(clipboard);
	}

	// Targets: the current selection, which must match the copied modules' types (official editor).
	async function pasteParams(): Promise<void> {
		const clipboard = await readClipboardEntry(uiStore);
		if (!clipboard || clipboard.modules.length === 0) return;
		const area = getSourceArea();
		const { areaIdx } = areaConfig(area);
		const currentModules = slotsStore.getAreaModules(uiStore.slotInFocus, areaIdx);
		const pairs = buildPasteParamsPairs(clipboard.modules, clipboard.copiedVariation, uiStore.selectedModules, currentModules, clipboard.morphs, areaIdx);
		if (!pairs) return showToast(PASTE_PARAMS_MISMATCH);
		await slotsStore.pasteParams(pairs, uiStore.variation, area);
	}

	return { copySelection, cutSelection, pasteClipboard, pasteParams, hasClipboard };
}
