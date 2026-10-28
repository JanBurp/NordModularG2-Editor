import type { Ref } from 'vue';
import type { ClipboardEntry } from '@/types/patch';
import { getModule } from '../renderer/nmg2mods';
import { clientToSvgPoint } from '../renderer/svgUtils';
import { useUiStore } from '../store/ui';

// Drops a module type (Modules pane) or a library item (Library pane) onto the canvas.
export function useModuleDrop(
	svgRef: Ref<SVGSVGElement | null>,
	onDrop: (info: { typeId: number; col: number; row: number }) => void,
	onLibraryDrop: (info: { entry: ClipboardEntry; col: number; row: number }) => void,
) {
	const ui = useUiStore();
	let dropGhost: SVGGElement | null = null;

	function toGrid(e: DragEvent) {
		const mp = clientToSvgPoint(svgRef.value, e.clientX, e.clientY);
		return mp && { col: Math.max(0, Math.floor(mp.x / 256)), row: Math.max(0, Math.floor(mp.y / 16)) };
	}

	// One rect per dragged module, relative to the drop cell.
	function ghostRects(): { col: number; row: number; height: number }[] {
		if (ui.draggedModuleId) return [{ col: 0, row: 0, height: getModule(ui.draggedModuleId)?.height || 2 }];
		const modules = ui.draggedLibraryItem?.modules ?? [];
		const minCol = Math.min(...modules.map((m) => m.horiz));
		const minRow = Math.min(...modules.map((m) => m.vert));
		return modules.map((m) => ({ col: m.horiz - minCol, row: m.vert - minRow, height: getModule(m.type)?.height || 2 }));
	}

	function handleDragOver(e: DragEvent) {
		if (!svgRef.value) return;
		const rects = ghostRects();
		if (rects.length === 0) {
			clearDropGhost();
			return;
		}
		const grid = toGrid(e);
		if (!grid) return;
		if (!dropGhost) {
			dropGhost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			dropGhost.setAttribute('pointer-events', 'none');
			for (const r of rects) {
				const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				rect.setAttribute('fill', 'rgba(100,200,100,0.25)');
				rect.setAttribute('stroke', '#4ade80');
				rect.setAttribute('stroke-width', '2');
				rect.setAttribute('rx', '2');
				rect.setAttribute('x', String(r.col * 256));
				rect.setAttribute('y', String(r.row * 16));
				rect.setAttribute('width', '256');
				rect.setAttribute('height', String(r.height * 16));
				dropGhost.appendChild(rect);
			}
			(svgRef.value as SVGElement).appendChild(dropGhost);
		}
		dropGhost.setAttribute('transform', `translate(${grid.col * 256}, ${grid.row * 16})`);
	}

	function clearDropGhost() {
		dropGhost?.remove();
		dropGhost = null;
	}

	function handleModuleDropOnWrapper(e: DragEvent) {
		clearDropGhost();
		const grid = svgRef.value && toGrid(e);
		if (!grid) return;
		// A library drag carries its file path, never a number.
		const typeId = parseInt(e.dataTransfer?.getData('text/plain') || '0');
		if (typeId) onDrop({ typeId, ...grid });
		else if (ui.draggedLibraryItem) onLibraryDrop({ entry: ui.draggedLibraryItem, ...grid });
	}

	return { handleDragOver, clearDropGhost, handleModuleDropOnWrapper };
}
