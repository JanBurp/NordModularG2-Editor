import { useUiStore } from '../store/ui';

// Shared drag-start/end contract for any UI that drags a module type onto the canvas
// (ModulesPane, ModulePicker, ...): dataTransfer carries the type id for the drop handler,
// ui.draggedModuleId drives the live drop-position ghost preview (see useModuleDrop.ts).
export function useModuleDragSource() {
	const ui = useUiStore();

	function handleDragStart(e: DragEvent, moduleId: number) {
		if (e.dataTransfer) e.dataTransfer.setData('text/plain', String(moduleId));
		ui.draggedModuleId = moduleId;
	}

	function handleDragEnd() {
		ui.draggedModuleId = null;
	}

	return { handleDragStart, handleDragEnd };
}
