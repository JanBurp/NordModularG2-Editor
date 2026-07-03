import type { Ref } from 'vue';
import { getModule } from '../renderer/nmg2mods';
import { clientToSvgPoint } from '../renderer/svgUtils';
import { useUiStore } from '../store/ui';

export function useModuleDrop(svgRef: Ref<SVGSVGElement | null>, onDrop: (info: { typeId: number; col: number; row: number }) => void) {
	const ui = useUiStore();
	let dropGhost: SVGRectElement | null = null;

	function toSvgCoords(e: MouseEvent) {
		return clientToSvgPoint(svgRef.value, e.clientX, e.clientY);
	}

	function handleDragOver(e: DragEvent) {
		if (!svgRef.value) return;
		const typeId = ui.draggedModuleId;
		if (!typeId) {
			clearDropGhost();
			return;
		}
		const mp = toSvgCoords(e as unknown as MouseEvent);
		if (!mp) return;
		const col = Math.max(0, Math.floor(mp.x / 256));
		const row = Math.max(0, Math.floor(mp.y / 16));
		const modDef = getModule(typeId);
		const modHeight = (modDef?.height || 2) * 16;
		if (!dropGhost) {
			dropGhost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			dropGhost.setAttribute('fill', 'rgba(100,200,100,0.25)');
			dropGhost.setAttribute('stroke', '#4ade80');
			dropGhost.setAttribute('stroke-width', '2');
			dropGhost.setAttribute('rx', '2');
			dropGhost.setAttribute('pointer-events', 'none');
			(svgRef.value as SVGElement).appendChild(dropGhost);
		}
		dropGhost.setAttribute('width', '256');
		dropGhost.setAttribute('height', String(modHeight));
		dropGhost.setAttribute('transform', `translate(${col * 256}, ${row * 16})`);
	}

	function clearDropGhost() {
		dropGhost?.remove();
		dropGhost = null;
	}

	function handleModuleDropOnWrapper(e: DragEvent) {
		clearDropGhost();
		const typeId = parseInt(e.dataTransfer?.getData('text/plain') || '0');
		if (!typeId || !svgRef.value) return;
		const mp = toSvgCoords(e as unknown as MouseEvent);
		if (!mp) return;
		const col = Math.max(0, Math.floor(mp.x / 256));
		const row = Math.max(0, Math.floor(mp.y / 16));
		onDrop({ typeId, col, row });
	}

	return { handleDragOver, clearDropGhost, handleModuleDropOnWrapper };
}
