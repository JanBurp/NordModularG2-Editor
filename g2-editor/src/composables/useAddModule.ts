import { ref } from 'vue';
import { useUiStore } from '../store/ui';
import { useSlotsStore } from '../store/slots';
import { useSettingsStore } from '../store/settings';
import { useGhostCable } from './useGhostCable';

const isAdding = ref(false);

// Shared by every module-add entry point (addModuleAt below, plus the toolbar drag-and-drop path
// in usePatchOperations.ts): runs auto-suggest-cable.
export function finalizeModuleAdd(moduleId: number, col: number, row: number, area: 'va' | 'fx') {
	const settings = useSettingsStore();
	const { computeGhostSuggestion } = useGhostCable();
	if (settings.autoSuggestCable) computeGhostSuggestion(moduleId, col, row, area);
}

export function useAddModule() {
	const ui = useUiStore();
	const slotsStore = useSlotsStore();

	async function addModuleAt(typeId: number, col: number, row: number, area: 'va' | 'fx') {
		if (isAdding.value) return;
		isAdding.value = true;
		try {
			const isVoice = area === 'va';
			const areaName = isVoice ? 'voice' : 'fx';
			const areaNum: 0 | 1 = isVoice ? 1 : 0;
			const modules = slotsStore.getAreaModules(ui.slotInFocus, areaNum);
			const result = await slotsStore.dropModuleWithCollision(typeId, col, row, areaName, modules);
			if (result) finalizeModuleAdd(result.moduleId, col, row, area);
		} finally {
			isAdding.value = false;
		}
	}

	async function addModuleAtMousePos(typeId: number) {
		const pos = ui.lastMousePos;
		await addModuleAt(typeId, pos?.col ?? 0, pos?.row ?? 0, pos?.area ?? 'va');
	}

	return { addModuleAt, addModuleAtMousePos };
}
