import { computed } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import type { Cable } from '../renderer/cableRenderer';
import { areaConfig, buildCloneEntries, buildPasteParamsPairs, resolveSelectionArea, type JackEnd } from '../store/slotHelpers';
import { finalizeModuleAdd } from './useAddModule';
import { readClipboardEntry } from './usePatchClipboard';

export function usePatchOperations(areaGetter?: () => 'voice' | 'fx') {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const getArea = areaGetter ?? (() => resolveSelectionArea(uiStore));

	const currentModules = computed(() => slotsStore.getAreaModules(uiStore.slotInFocus, areaConfig(getArea()).areaIdx));
	const currentCables = computed(() => slotsStore.getAreaCables(uiStore.slotInFocus, areaConfig(getArea()).areaIdx));

	async function deleteSelection(): Promise<void> {
		try {
			await slotsStore.deleteSelection(uiStore.selectedModules, uiStore.selectedCables, getArea(), currentModules.value, currentCables.value);
		} finally {
			uiStore.clearSelection();
			uiStore.selectedCables = [];
		}
	}

	async function deleteUnusedModules(): Promise<void> {
		const { getModule } = await import('../renderer/nmg2mods');
		const NAME_MODULE_TYPE = 126;
		// A Name bar has no jacks (always "unused"); only sweep it away if the user never customized it.
		const isUntouchedNameModule = (m: any) =>
			m.type === NAME_MODULE_TYPE && (m.colour || 0) === 0 && (m.uname ?? '') === (getModule(m.type)?.short ?? 'Module') + m.index;

		for (const area of ['voice', 'fx'] as const) {
			const modules = slotsStore.getAreaModules(uiStore.slotInFocus, areaConfig(area).areaIdx);
			const cables = slotsStore.getAreaCables(uiStore.slotInFocus, areaConfig(area).areaIdx);
			const unusedIds = modules
				.filter((m: any) => !cables.some((c: any) => c.smod === m.index || c.dmod === m.index))
				.filter((m: any) => m.type !== NAME_MODULE_TYPE || isUntouchedNameModule(m))
				.map((m: any) => m.index as number);
			if (unusedIds.length > 0) {
				await slotsStore.deleteSelection(unusedIds, [], area, modules, cables);
			}
		}
	}

	async function handleModuleMove({
		indices,
		dCol,
		dRow,
		isCopy,
	}: {
		indices: number[];
		dCol: number;
		dRow: number;
		anchorIndex: number;
		isCopy: boolean;
	}): Promise<void> {
		const area = getArea();
		if (isCopy) {
			const selected = currentModules.value.filter((m: any) => indices.includes(m.index));
			const existingIds = currentModules.value.map((m: any) => m.index as number);
			const { entries, remappedCables } = buildCloneEntries(selected, currentCables.value, existingIds, dCol, dRow);
			await slotsStore.paste(entries, remappedCables, area);
			uiStore.selectModules(
				entries.map((e) => e.newId),
				area === 'voice' ? 'va' : 'fx',
			);
			return;
		}
		const result = await slotsStore.moveModulesWithCollision(indices, dCol, dRow, area, currentModules.value);
		if (result?.patch?.description?.variation !== undefined) uiStore.variation = result.patch.description.variation;
	}

	async function handleModuleDrop({ typeId, col, row }: { typeId: number; col: number; row: number }): Promise<void> {
		const result = await slotsStore.dropModuleWithCollision(typeId, col, row, getArea(), currentModules.value);
		if (result?.patch?.description?.variation !== undefined) uiStore.variation = result.patch.description.variation;
		if (result) {
			const area = getArea() === 'voice' ? 'va' : 'fx';
			finalizeModuleAdd(result.moduleId, col, row, area);
		}
	}

	async function handleParamChange(moduleIndex: number, paramIndex: number, value: number, immediate = false): Promise<void> {
		try {
			await slotsStore.setParam(moduleIndex, paramIndex, value, uiStore.variation, getArea(), immediate);
		} catch {
			/* G2 may be temporarily busy */
		}
	}

	let modeChangeTimer: ReturnType<typeof setTimeout> | null = null;
	function handleModeChange(moduleIndex: number, index: number, value: number): void {
		if (modeChangeTimer) clearTimeout(modeChangeTimer);
		modeChangeTimer = setTimeout(async () => {
			modeChangeTimer = null;
			try {
				await slotsStore.setMode(moduleIndex, index, value, uiStore.variation, getArea());
			} catch {
				/* G2 may be temporarily busy */
			}
		}, 50);
	}

	async function handleModuleDelete(moduleIndex: number): Promise<void> {
		await slotsStore.deleteModule(moduleIndex, getArea());
		uiStore.selectModules(
			uiStore.selectedModules.filter((i) => i !== moduleIndex),
			uiStore.selectedModulesArea ?? (getArea() === 'voice' ? 'va' : 'fx'),
		);
	}

	async function handleModuleColorChange(moduleIndex: number, colorId: number): Promise<void> {
		const targets = uiStore.selectedModules.includes(moduleIndex) ? uiStore.selectedModules : [moduleIndex];
		uiStore.setModuleColor(colorId);
		await slotsStore.setModuleColors(targets, colorId, getArea());
	}

	async function handleModuleReplace(moduleIndex: number, newTypeId: number): Promise<void> {
		await slotsStore.replaceModule(moduleIndex, newTypeId, getArea());
	}

	// Explicit target: this module, or the current selection if it's part of it (mirrors handleModuleColorChange).
	async function handlePasteParams(moduleIndex: number): Promise<void> {
		// Reads via the OS clipboard first — a copy may have happened in another window's
		// process (one BrowserWindow per connected G2, see usePatchClipboard.ts).
		const clipboard = await readClipboardEntry(uiStore);
		if (!clipboard || clipboard.modules.length === 0) return;
		const targets = uiStore.selectedModules.includes(moduleIndex) ? uiStore.selectedModules : [moduleIndex];
		const pairs = buildPasteParamsPairs(clipboard.modules, clipboard.copiedVariation, targets, currentModules.value);
		if (pairs.length === 0) return;
		await slotsStore.pasteParams(pairs, uiStore.variation, getArea());
	}

	async function handleJackDeleteConnected({
		moduleIndex,
		connectorIndex,
		type,
	}: {
		moduleIndex: number;
		connectorIndex: number;
		type: 'input' | 'output';
	}): Promise<void> {
		await slotsStore.deleteConnectedCables(moduleIndex, connectorIndex, type, getArea());
	}

	async function handleJackBreakConnection({
		moduleIndex,
		connectorIndex,
		type,
	}: {
		moduleIndex: number;
		connectorIndex: number;
		type: 'input' | 'output';
	}): Promise<void> {
		await slotsStore.breakJackConnection(moduleIndex, connectorIndex, type, getArea());
	}

	async function handleCableGroupDrop(group: Cable[], fromJack: JackEnd, toJack: JackEnd | null): Promise<void> {
		try {
			if (toJack) {
				await slotsStore.moveCableGroup(group, fromJack, toJack, getArea());
			} else {
				await slotsStore.deleteSelection([], group, getArea(), currentModules.value, currentCables.value);
			}
		} finally {
			uiStore.selectedCables = [];
		}
	}

	async function handleJackSetCableColor({
		moduleIndex,
		connectorIndex,
		type,
		colorId,
	}: {
		moduleIndex: number;
		connectorIndex: number;
		type: 'input' | 'output';
		colorId: number;
	}): Promise<void> {
		await slotsStore.setCableColor(moduleIndex, connectorIndex, type, colorId, getArea());
	}

	return {
		currentModules,
		deleteSelection,
		deleteUnusedModules,
		handleModuleMove,
		handleModuleDrop,
		handleParamChange,
		handleModeChange,
		handleModuleDelete,
		handleModuleColorChange,
		handleModuleReplace,
		handlePasteParams,
		handleJackDeleteConnected,
		handleJackBreakConnection,
		handleCableGroupDrop,
		handleJackSetCableColor,
	};
}
