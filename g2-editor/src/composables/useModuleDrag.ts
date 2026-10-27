import { ref, computed, onUnmounted } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { getModule } from '../renderer/nmg2mods';
import { useUiStore } from '../store/ui';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants';
import { isGrabModifierPressed } from '../utils/platform';

type DragState = {
	indices: number[];
	startPosByIndex: Map<number, { horiz: number; vert: number }>;
	anchorIndex: number;
	dxPx: number;
	dyPx: number;
};

type ModuleDragInfo = {
	moduleIndex: number;
	clientX: number;
	clientY: number;
};

type DragGhost = { idx: number; x: number; y: number; height: number };

export function useModuleDrag(
	getModules: () => any[],
	onMove: (info: { indices: number[]; dCol: number; dRow: number; anchorIndex: number; isCopy: boolean }) => void,
	onModuleClick: (index: number, shiftKey: boolean) => void,
	getZoom: () => number,
): {
	dragState: Ref<DragState | null>;
	dragGhosts: ComputedRef<DragGhost[]>;
	handleModuleDragStart: (info: ModuleDragInfo) => void;
	clearModuleDrag: () => void;
} {
	const ui = useUiStore();
	const dragState = ref<DragState | null>(null);

	let dragModuleIndex: number | null = null;
	let dragStartClientX = 0;
	let dragStartClientY = 0;
	let dragMoved = false;

	const dragGhosts = computed<DragGhost[]>(() => {
		const drag = dragState.value;
		if (!drag) return [];
		return drag.indices
			.map((idx) => {
				const start = drag.startPosByIndex.get(idx);
				const mod = getModules().find((m) => m.index === idx);
				if (!start || !mod) return null;
				const height = (getModule(mod.type)?.height ?? 2) * MODULE_ROW_HEIGHT;
				return {
					idx,
					x: start.horiz * MODULE_WIDTH + drag.dxPx,
					y: start.vert * MODULE_ROW_HEIGHT + drag.dyPx,
					height,
				};
			})
			.filter((g): g is DragGhost => g !== null);
	});

	function handleModuleDragStart(info: ModuleDragInfo) {
		dragModuleIndex = info.moduleIndex;
		dragStartClientX = info.clientX;
		dragStartClientY = info.clientY;
		dragMoved = false;
		window.addEventListener('mousemove', onModuleDragMove);
		window.addEventListener('mouseup', onModuleDragEnd);
		window.addEventListener('keydown', updateCopyCursor);
		window.addEventListener('keyup', updateCopyCursor);
	}

	// Copy vs move is decided on mouseup, so the cursor follows the modifier live — also on key
	// press/release while the mouse stands still.
	function updateCopyCursor(e: MouseEvent | KeyboardEvent) {
		if (dragMoved) document.body.style.cursor = isGrabModifierPressed(e) ? 'copy' : '';
	}

	function onModuleDragMove(e: MouseEvent) {
		if (dragModuleIndex === null) return;
		const dxPx = (e.clientX - dragStartClientX) / getZoom();
		const dyPx = (e.clientY - dragStartClientY) / getZoom();
		if (!dragMoved) {
			if (Math.hypot(dxPx, dyPx) < 5) return;
			const sel = ui.selectedModules;
			const indices = sel.includes(dragModuleIndex) ? [...sel] : [dragModuleIndex];
			const startPosByIndex = new Map<number, { horiz: number; vert: number }>();
			for (const id of indices) {
				const m = getModules().find((x) => x.index === id);
				if (m) startPosByIndex.set(id, { horiz: m.horiz, vert: m.vert });
			}
			if (startPosByIndex.size === 0) return;
			dragState.value = { indices, startPosByIndex, anchorIndex: dragModuleIndex, dxPx: 0, dyPx: 0 };
			dragMoved = true;
		}
		dragState.value = { ...dragState.value!, dxPx, dyPx };
		updateCopyCursor(e);
	}

	function onModuleDragEnd(e: MouseEvent) {
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
		window.removeEventListener('keydown', updateCopyCursor);
		window.removeEventListener('keyup', updateCopyCursor);
		document.body.style.cursor = '';
		const moduleIndex = dragModuleIndex;
		dragModuleIndex = null;
		const drag = dragState.value;
		dragState.value = null;
		if (drag && moduleIndex !== null) {
			const anchorStart = drag.startPosByIndex.get(drag.anchorIndex)!;
			const anchorTargetCol = Math.max(0, Math.round(anchorStart.horiz + drag.dxPx / MODULE_WIDTH));
			const anchorTargetRow = Math.max(0, Math.round(anchorStart.vert + drag.dyPx / MODULE_ROW_HEIGHT));
			const dCol = anchorTargetCol - anchorStart.horiz;
			const dRow = anchorTargetRow - anchorStart.vert;
			if (dCol !== 0 || dRow !== 0) {
				onMove({ indices: drag.indices, dCol, dRow, anchorIndex: drag.anchorIndex, isCopy: isGrabModifierPressed(e) });
			}
		} else if (moduleIndex !== null) {
			onModuleClick(moduleIndex, e.shiftKey);
		}
		dragMoved = false;
	}

	function clearModuleDrag() {
		dragState.value = null;
		dragModuleIndex = null;
		dragMoved = false;
		document.body.style.cursor = '';
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
		window.removeEventListener('keydown', updateCopyCursor);
		window.removeEventListener('keyup', updateCopyCursor);
	}

	onUnmounted(() => {
		clearModuleDrag();
	});

	return { dragState, dragGhosts, handleModuleDragStart, clearModuleDrag };
}
