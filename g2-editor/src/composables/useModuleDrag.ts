import { ref, computed, onUnmounted } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { getModule } from '../renderer/nmg2mods';
import { useUiStore } from '../store/ui';

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
	onMove: (info: { indices: number[]; dCol: number; dRow: number; anchorIndex: number }) => void,
	onModuleClick: (index: number, shiftKey: boolean) => void,
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
				const height = (getModule(mod.type)?.height ?? 2) * 16;
				return {
					idx,
					x: start.horiz * 256 + drag.dxPx,
					y: start.vert * 16 + drag.dyPx,
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
	}

	function onModuleDragMove(e: MouseEvent) {
		if (dragModuleIndex === null) return;
		const dxPx = e.clientX - dragStartClientX;
		const dyPx = e.clientY - dragStartClientY;
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
	}

	function onModuleDragEnd(e: MouseEvent) {
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
		const moduleIndex = dragModuleIndex;
		dragModuleIndex = null;
		const drag = dragState.value;
		dragState.value = null;
		if (drag && moduleIndex !== null) {
			const anchorStart = drag.startPosByIndex.get(drag.anchorIndex)!;
			const anchorTargetCol = Math.max(0, Math.round(anchorStart.horiz + drag.dxPx / 256));
			const anchorTargetRow = Math.max(0, Math.round(anchorStart.vert + drag.dyPx / 16));
			const dCol = anchorTargetCol - anchorStart.horiz;
			const dRow = anchorTargetRow - anchorStart.vert;
			if (dCol !== 0 || dRow !== 0) {
				onMove({ indices: drag.indices, dCol, dRow, anchorIndex: drag.anchorIndex });
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
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
	}

	onUnmounted(() => {
		clearModuleDrag();
	});

	return { dragState, dragGhosts, handleModuleDragStart, clearModuleDrag };
}
