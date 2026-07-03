import { computed } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { areaConfig, resolveSelectionArea } from '../store/slotHelpers';
import { usePatchOperations } from './usePatchOperations';

export function usePatchClipboard(areaGetter?: () => 'voice' | 'fx') {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { deleteSelection } = usePatchOperations(areaGetter);

	const getSourceArea = areaGetter ?? (() => resolveSelectionArea(uiStore));

	const hasClipboard = computed(() => uiStore.clipboard !== null && uiStore.clipboard.modules.length > 0);

	function copySelection(): void {
		const selectedIds = new Set(uiStore.selectedModules);
		if (selectedIds.size === 0) return;

		const area = getSourceArea();
		const { areaIdx, location: areaKey } = areaConfig(area);
		const slot = uiStore.slotInFocus;

		const modules = slotsStore
			.getAreaModules(slot, areaIdx)
			.filter((m: any) => selectedIds.has(m.index as number))
			.map((m: any) => ({ ...m, lv: [...m.lv], modes: [...m.modes], paramLabels: m.paramLabels ? [...m.paramLabels] : undefined }));

		const cables = slotsStore
			.getAreaCables(slot, areaIdx)
			.filter((c: any) => selectedIds.has(c.smod as number) && selectedIds.has(c.dmod as number))
			.map((c: any) => ({ ...c }));

		uiStore.clipboard = { modules, cables, area: areaKey };
	}

	async function cutSelection(): Promise<void> {
		copySelection();
		await deleteSelection();
	}

	async function pasteClipboard(): Promise<void> {
		const clipboard = uiStore.clipboard;
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
		const dRow = targetRow - minRow;

		// Generate new IDs against the destination area
		const existingIds = slotsStore.getAreaModules(uiStore.slotInFocus, areaIdx).map((m: any) => m.index as number);
		let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

		const idMap = new Map<number, number>();
		for (const mod of clipboard.modules) {
			idMap.set(mod.index, nextId++);
		}

		const entries = clipboard.modules.map((mod) => ({
			src: mod,
			newId: idMap.get(mod.index)!,
			col: Math.max(0, mod.horiz + dCol),
			row: Math.max(0, mod.vert + dRow),
		}));

		const remappedCables = clipboard.cables
			.filter((c) => idMap.has(c.smod) && idMap.has(c.dmod))
			.map((c) => ({ newSmod: idMap.get(c.smod)!, newDmod: idMap.get(c.dmod)!, colour: c.colour, scon: c.scon, dcon: c.dcon, dir: c.dir ?? 1 }));
		await slotsStore.paste(entries, remappedCables, area);

		uiStore.selectModules(
			entries.map((e) => e.newId),
			destAreaKey,
		);
	}

	return { copySelection, cutSelection, pasteClipboard, hasClipboard };
}
