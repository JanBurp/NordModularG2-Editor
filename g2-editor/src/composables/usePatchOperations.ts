import { computed } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { useDeviceStore } from '../store/device';

export function usePatchOperations() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const device = useDeviceStore();

	const currentModules = computed(() =>
		uiStore.area === 1 ? slotsStore.getAreaModules(uiStore.activeSlot, 1) : slotsStore.getAreaModules(uiStore.activeSlot, 0),
	);
	const currentCables = computed(() =>
		uiStore.area === 1 ? slotsStore.getAreaCables(uiStore.activeSlot, 1) : slotsStore.getAreaCables(uiStore.activeSlot, 0),
	);

	async function deleteSelection(): Promise<void> {
		try {
			await slotsStore.deleteSelection(
				uiStore.selectedModules,
				uiStore.selectedCables,
				uiStore.area === 1 ? 'voice' : 'fx',
				currentModules.value,
				currentCables.value,
			);
		} finally {
			uiStore.clearSelection();
			uiStore.selectedCables = [];
		}
	}

	async function handleModuleMove({ indices, dCol, dRow }: { indices: number[]; dCol: number; dRow: number; anchorIndex: number }): Promise<void> {
		const result = await slotsStore.moveModulesWithCollision(indices, dCol, dRow, uiStore.area === 1 ? 'voice' : 'fx', currentModules.value);
		if (result?.patch?.description?.variation !== undefined) uiStore.variation = result.patch.description.variation;
	}

	async function handleModuleDrop({ typeId, col, row }: { typeId: number; col: number; row: number }): Promise<void> {
		const result = await slotsStore.dropModuleWithCollision(typeId, col, row, uiStore.area === 1 ? 'voice' : 'fx', currentModules.value);
		if (result?.patch?.description?.variation !== undefined) uiStore.variation = result.patch.description.variation;
	}

	let paramChangeTimer: ReturnType<typeof setTimeout> | null = null;
	function handleParamChange(moduleIndex: number, paramIndex: number, value: number): void {
		if (device.status !== 'connected') return;
		if (paramChangeTimer) clearTimeout(paramChangeTimer);
		paramChangeTimer = setTimeout(async () => {
			paramChangeTimer = null;
			try {
				await slotsStore.setParam(moduleIndex, paramIndex, value, uiStore.variation, uiStore.area === 1 ? 'voice' : 'fx');
			} catch {
				/* G2 may be temporarily busy */
			}
		}, 50);
	}

	function handleModeChange(moduleIndex: number, index: number, value: number): void {
		if (device.status !== 'connected') return;
		if (paramChangeTimer) clearTimeout(paramChangeTimer);
		paramChangeTimer = setTimeout(async () => {
			paramChangeTimer = null;
			try {
				await slotsStore.setMode(moduleIndex, index, value, uiStore.variation, uiStore.area === 1 ? 'voice' : 'fx');
			} catch {
				/* G2 may be temporarily busy */
			}
		}, 50);
	}

	async function handleModuleDelete(moduleIndex: number): Promise<void> {
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.deleteModule(moduleIndex, area as 'voice' | 'fx');
		uiStore.selectModules(uiStore.selectedModules.filter((i) => i !== moduleIndex));
	}

	async function handleModuleColorChange(moduleIndex: number, colorId: number): Promise<void> {
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		const targets = uiStore.selectedModules.includes(moduleIndex) ? uiStore.selectedModules : [moduleIndex];
		uiStore.setModuleColor(colorId);
		await slotsStore.setModuleColors(targets, colorId, area as 'voice' | 'fx');
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
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.deleteConnectedCables(moduleIndex, connectorIndex, type, area);
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
		const area = uiStore.area === 1 ? 'voice' : 'fx';
		await slotsStore.setCableColor(moduleIndex, connectorIndex, type, colorId, area);
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
