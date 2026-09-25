import { ref } from 'vue';
import { useUiStore } from '../store/ui';
import { useSlotsStore } from '../store/slots';
import { useSettingsStore } from '../store/settings';
import { useGhostCable } from './useGhostCable';

const isAdding = ref(false);

let lastAddedModule: { index: number; area: 'va' | 'fx' } | null = null;

// Tracked across all four add-module entry points (this file's addModuleAt, plus the toolbar
// drag-and-drop path handled in usePatchOperations.ts) for auto-suggest's "most recently added
// module" fallback tier.
export function getLastAddedModule() {
	return lastAddedModule;
}

export function setLastAddedModule(index: number, area: 'va' | 'fx') {
	lastAddedModule = { index, area };
}

export function useAddModule() {
	const ui = useUiStore();
	const slotsStore = useSlotsStore();
	const settings = useSettingsStore();
	const { computeGhostSuggestion } = useGhostCable();

	async function addModuleAt(typeId: number, col: number, row: number, area: 'va' | 'fx') {
		if (isAdding.value) return;
		isAdding.value = true;
		try {
			const isVoice = area === 'va';
			const areaName = isVoice ? 'voice' : 'fx';
			const areaNum: 0 | 1 = isVoice ? 1 : 0;
			const modules = slotsStore.getAreaModules(ui.slotInFocus, areaNum);
			const result = await slotsStore.dropModuleWithCollision(typeId, col, row, areaName, modules);
			if (result) {
				// Compute the suggestion before updating lastAddedModule — tier 3 needs the
				// *previously* added module, not this one.
				if (settings.autoSuggestCable) computeGhostSuggestion(result.moduleId, col, row, area);
				setLastAddedModule(result.moduleId, area);
			}
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
