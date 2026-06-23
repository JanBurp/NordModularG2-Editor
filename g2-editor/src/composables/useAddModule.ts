import { ref } from 'vue';
import { useUiStore } from '../store/ui';
import { useSlotsStore } from '../store/slots';

const isAdding = ref(false);

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
			await slotsStore.dropModuleWithCollision(typeId, col, row, areaName, modules);
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
