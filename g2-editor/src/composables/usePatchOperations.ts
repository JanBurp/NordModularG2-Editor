import { computed } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { useDeviceStore } from '../store/device';

export function usePatchOperations(areaGetter?: () => 'voice' | 'fx') {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const device = useDeviceStore();

	const getArea = areaGetter ?? (() => {
		if (uiStore.selectedModulesArea === 'va') return 'voice';
		if (uiStore.selectedModulesArea === 'fx') return 'fx';
		return uiStore.activeArea === 1 ? 'voice' : 'fx';
	});

	const currentModules = computed(() =>
		getArea() === 'voice' ? slotsStore.getAreaModules(uiStore.slotInFocus, 1) : slotsStore.getAreaModules(uiStore.slotInFocus, 0),
	);
	const currentCables = computed(() =>
		getArea() === 'voice' ? slotsStore.getAreaCables(uiStore.slotInFocus, 1) : slotsStore.getAreaCables(uiStore.slotInFocus, 0),
	);

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
		uiStore.selectModules(uiStore.selectedModules.filter((i) => i !== moduleIndex), uiStore.selectedModulesArea ?? (getArea() === 'voice' ? 'va' : 'fx'));
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
		handleJackSetCableColor,
	};
}
