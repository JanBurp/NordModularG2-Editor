import type { ComputedRef, Ref } from 'vue';

import { getModule } from '@/renderer/nmg2mods';
import { ref } from 'vue';
import { useUiStore } from '@/store/ui';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants';

interface ModuleInstance {
	index?: number;
	type: number;
	horiz?: number;
	vert?: number;
}

export function useModuleSelecting(
	svgEl: Ref<SVGSVGElement | null>,
	modules: Ref<ModuleInstance[]> | ComputedRef<ModuleInstance[]>,
	rectEl: Ref<HTMLDivElement | null>,
) {
	const uiStore = useUiStore();
	const shiftHeld = ref(false);
	const suppressNextClick = ref(false);

	let cachedInverseCTM: DOMMatrix | null = null;
	let cachedSVGPoint: SVGPoint | null = null;
	let rafId: number | null = null;
	let pendingClientX = 0;
	let pendingClientY = 0;
	let startX = 0, startY = 0;
	let lastX = 0, lastY = 0;
	let isDragging = false;

	function captureCtm() {
		const svg = svgEl.value;
		if (!svg?.getScreenCTM) return;
		const ctm = svg.getScreenCTM();
		if (!ctm) return;
		cachedInverseCTM = ctm.inverse();
		cachedSVGPoint = cachedSVGPoint ?? svg.createSVGPoint();
	}

	function toSvgCoords(clientX: number, clientY: number) {
		if (!cachedInverseCTM || !cachedSVGPoint) return null;
		cachedSVGPoint.x = clientX;
		cachedSVGPoint.y = clientY;
		return cachedSVGPoint.matrixTransform(cachedInverseCTM);
	}

	function updateRect(x1: number, y1: number, x2: number, y2: number) {
		const el = rectEl.value;
		if (!el) return;
		el.style.left   = Math.min(x1, x2) + 'px';
		el.style.top    = Math.min(y1, y2) + 'px';
		el.style.width  = Math.abs(x2 - x1) + 'px';
		el.style.height = Math.abs(y2 - y1) + 'px';
	}

	function getModulesInRect(x1: number, y1: number, x2: number, y2: number): number[] {
		const rx1 = Math.min(x1, x2);
		const ry1 = Math.min(y1, y2);
		const rx2 = Math.max(x1, x2);
		const ry2 = Math.max(y1, y2);
		const result: number[] = [];
		for (const m of modules.value) {
			if (m.index === undefined) continue;
			const mx1 = (m.horiz || 0) * MODULE_WIDTH;
			const my1 = (m.vert || 0) * MODULE_ROW_HEIGHT;
			const mx2 = mx1 + MODULE_WIDTH;
			const mh = (getModule(m.type)?.height ?? 2) * MODULE_ROW_HEIGHT;
			const my2 = my1 + mh;
			if (!(mx2 < rx1 || mx1 > rx2 || my2 < ry1 || my1 > ry2)) {
				result.push(m.index);
			}
		}
		return result;
	}

	function onMouseMove(e: MouseEvent) {
		pendingClientX = e.clientX;
		pendingClientY = e.clientY;
		if (rafId !== null) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			const coords = toSvgCoords(pendingClientX, pendingClientY);
			if (!coords) return;
			lastX = coords.x;
			lastY = coords.y;
			if (!isDragging) {
				const dx = coords.x - startX;
				const dy = coords.y - startY;
				if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
					isDragging = true;
					if (rectEl.value) rectEl.value.style.display = 'block';
				}
			}
			if (isDragging) updateRect(startX, startY, coords.x, coords.y);
		});
	}

	function onMouseUp(_e: MouseEvent) {
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', onMouseUp);
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		cachedInverseCTM = null;
		if (svgEl.value) svgEl.value.style.pointerEvents = '';
		if (rectEl.value) rectEl.value.style.display = 'none';

		if (isDragging) {
			const inside = getModulesInRect(startX, startY, lastX, lastY);
			if (shiftHeld.value) {
				inside.forEach((idx) => uiStore.toggleModuleSelection(idx));
			} else {
				uiStore.selectModules(inside);
			}
			suppressNextClick.value = true;
		} else {
			uiStore.clearSelection();
		}

		isDragging = false;
	}

	function handleCanvasMousedown(event: MouseEvent) {
		if (event.button !== 0) return;
		shiftHeld.value = event.shiftKey;
		captureCtm();
		const coords = toSvgCoords(event.clientX, event.clientY);
		if (!coords) return;
		startX = coords.x;
		startY = coords.y;
		lastX = coords.x;
		lastY = coords.y;
		isDragging = false;
		if (svgEl.value) svgEl.value.style.pointerEvents = 'none';
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
		handleCanvasMousedown,
		handleModuleClick,
		handleCanvasClick,
	};
}
