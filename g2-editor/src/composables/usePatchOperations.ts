import { computed } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import type { Cable } from '../renderer/cableRenderer';
import { areaConfig, resolveSelectionArea, type JackEnd } from '../store/slotHelpers';

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

	async function handleModuleMove({ indices, dCol, dRow }: { indices: number[]; dCol: number; dRow: number; anchorIndex: number }): Promise<void> {
		const result = await slotsStore.moveModulesWithCollision(indices, dCol, dRow, getArea(), currentModules.value);
		if (result?.patch?.description?.variation !== undefined) uiStore.variation = result.patch.description.variation;
	}

	async function handleModuleDrop({ typeId, col, row }: { typeId: number; col: number; row: number }): Promise<void> {
		const result = await slotsStore.dropModuleWithCollision(typeId, col, row, getArea(), currentModules.value);
		if (result?.patch?.description?.variation !== undefined) uiStore.variation = result.patch.description.variation;
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
		handleModuleMove,
		handleModuleDrop,
		handleParamChange,
		handleModeChange,
		handleModuleDelete,
		handleModuleColorChange,
		handleJackDeleteConnected,
		handleJackBreakConnection,
		handleCableGroupDrop,
		handleJackSetCableColor,
	};
}
