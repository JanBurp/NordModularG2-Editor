import { ref, computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { useUiStore } from '@/store/ui';
import { getModule } from '@/renderer/nmg2mods';

interface ModuleInstance {
	index?: number;
	type: number;
	horiz?: number;
	vert?: number;
}

export function useModuleSelecting(svgEl: Ref<SVGSVGElement | null>, modules: Ref<ModuleInstance[]> | ComputedRef<ModuleInstance[]>) {
	const uiStore = useUiStore();

	const dragStart = ref<{ x: number; y: number } | null>(null);
	const dragCurrent = ref<{ x: number; y: number } | null>(null);
	const isDraggingSelection = ref(false);
	const shiftHeld = ref(false);
	const suppressNextClick = ref(false);

	const selectionRect = computed(() => {
		if (!dragStart.value || !dragCurrent.value) return null;
		const x = Math.min(dragStart.value.x, dragCurrent.value.x);
		const y = Math.min(dragStart.value.y, dragCurrent.value.y);
		const width = Math.abs(dragCurrent.value.x - dragStart.value.x);
		const height = Math.abs(dragCurrent.value.y - dragStart.value.y);
		return { x, y, width, height };
	});

	function toSvgCoords(clientX: number, clientY: number) {
		const svg = svgEl.value;
		if (!svg?.getScreenCTM) return null;
		const ctm = svg.getScreenCTM();
		if (!ctm) return null;
		const pt = svg.createSVGPoint();
		pt.x = clientX;
		pt.y = clientY;
		return pt.matrixTransform(ctm.inverse());
	}

	function getModulesInRect(rect: { x: number; y: number; width: number; height: number }): number[] {
		const rx1 = rect.x;
		const ry1 = rect.y;
		const rx2 = rect.x + rect.width;
		const ry2 = rect.y + rect.height;
		const result: number[] = [];
		for (const m of modules.value) {
			if (m.index === undefined) continue;
			const mx1 = (m.horiz || 0) * 256;
			const my1 = (m.vert || 0) * 16;
			const mx2 = mx1 + 256;
			const mh = ((getModule(m.type) as any)?.height ?? 2) * 16;
			const my2 = my1 + mh;
			if (!(mx2 < rx1 || mx1 > rx2 || my2 < ry1 || my1 > ry2)) {
				result.push(m.index);
			}
		}
		return result;
	}

	function onMouseMove(e: MouseEvent) {
		const coords = toSvgCoords(e.clientX, e.clientY);
		if (!coords || !dragStart.value) return;
		dragCurrent.value = coords;
		if (!isDraggingSelection.value) {
			const dx = coords.x - dragStart.value.x;
			const dy = coords.y - dragStart.value.y;
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDraggingSelection.value = true;
		}
	}

	function onMouseUp(_e: MouseEvent) {
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', onMouseUp);

		if (isDraggingSelection.value && selectionRect.value) {
			const inside = getModulesInRect(selectionRect.value);
			if (shiftHeld.value) {
				inside.forEach((idx) => uiStore.toggleModuleSelection(idx));
			} else {
				uiStore.selectModules(inside);
			}
			suppressNextClick.value = true;
		} else {
			uiStore.clearSelection();
		}

		dragStart.value = null;
		dragCurrent.value = null;
		isDraggingSelection.value = false;
	}

	function handleCanvasMousedown(event: MouseEvent) {
		if (event.button !== 0) return;
		shiftHeld.value = event.shiftKey;
		const coords = toSvgCoords(event.clientX, event.clientY);
		if (!coords) return;
		dragStart.value = coords;
		dragCurrent.value = coords;
		isDraggingSelection.value = false;
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	function handleModuleClick(index: number, shiftKey: boolean) {
		if (shiftKey) {
			uiStore.toggleModuleSelection(index);
		} else {
			uiStore.selectModules([index]);
		}
		uiStore.selectedCables = [];
	}

	function handleCanvasClick() {
		if (suppressNextClick.value) {
			suppressNextClick.value = false;
			return;
		}
		uiStore.clearSelection();
	}

	return {
		selectionRect,
		isDraggingSelection,
		handleCanvasMousedown,
		handleModuleClick,
		handleCanvasClick,
	};
}
