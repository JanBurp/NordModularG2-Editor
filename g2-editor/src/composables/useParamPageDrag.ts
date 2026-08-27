import { reactive, readonly } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

export type ParamDragPayload =
	| { kind: 'param'; location: 0 | 1; moduleIndex: number; paramIndex: number; label: string }
	| { kind: 'knob-slot'; slotIndex: number; label: string };

interface DragState {
	active: boolean;
	payload: ParamDragPayload | null;
	x: number;
	y: number;
}

const state = reactive<DragState>({ active: false, payload: null, x: 0, y: 0 });

// Read-only view for the ghost badge (ParamDragGhost.vue) and for cursor styling.
export function useParamPageDragState() {
	return readonly(state);
}

// Custom pointer-tracked drag for assigning a canvas param <-> a Parameter Pages toolbar knob slot,
// in either direction. Native HTML5 drag-and-drop was tried first but proved unreliable: dragging
// FROM the canvas's SVG <g> param elements never reliably started a native drag session (Chromium's
// drag-source recognition is flaky for SVG), and dragging FROM the toolbar's HTML cells raced with
// native text-selection dragging. This sidesteps the browser's drag-and-drop recognition entirely —
// just mouse tracking + elementFromPoint on release — matching how the rest of the canvas's own drag
// gestures (module move, cable drag, knob value-drag) already work in this codebase.
export function startParamPageDrag(e: MouseEvent, payload: ParamDragPayload) {
	e.preventDefault();
	e.stopPropagation();
	state.active = true;
	state.payload = payload;
	state.x = e.clientX;
	state.y = e.clientY;

	function onMove(ev: MouseEvent) {
		state.x = ev.clientX;
		state.y = ev.clientY;
	}
	function onUp(ev: MouseEvent) {
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
		state.active = false;
		state.payload = null;
		const target = document.elementFromPoint(ev.clientX, ev.clientY);
		if (target) handleDrop(target, payload);
	}
	document.addEventListener('mousemove', onMove);
	document.addEventListener('mouseup', onUp);
}

function handleDrop(target: Element, payload: ParamDragPayload) {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const slot = uiStore.slotInFocus;
	if (!slot) return;

	// Dropped onto a canvas param (Module.vue's param <g>, tagged with data-param-index/
	// data-param-location/data-module-index)?
	let paramEl: Element | null = target;
	while (paramEl && !paramEl.hasAttribute('data-param-index')) paramEl = paramEl.parentElement;
	if (paramEl) {
		const paramIndex = parseInt(paramEl.getAttribute('data-param-index') ?? '');
		const location = parseInt(paramEl.getAttribute('data-param-location') ?? '');
		const moduleIndex = parseInt(paramEl.getAttribute('data-module-index') ?? '');
		if (!isNaN(paramIndex) && !isNaN(location) && !isNaN(moduleIndex) && payload.kind === 'knob-slot') {
			slotsStore.assignParamToPage(slot, payload.slotIndex, location as 0 | 1, moduleIndex, paramIndex);
		}
		return;
	}

	// Dropped onto a Parameter Pages toolbar cell (tagged with data-knob-slot)?
	let cellEl: Element | null = target;
	while (cellEl && !cellEl.hasAttribute('data-knob-slot')) cellEl = cellEl.parentElement;
	if (cellEl) {
		const targetSlotIndex = parseInt(cellEl.getAttribute('data-knob-slot') ?? '');
		if (isNaN(targetSlotIndex)) return;
		if (payload.kind === 'param') {
			slotsStore.assignParamToPage(slot, targetSlotIndex, payload.location, payload.moduleIndex, payload.paramIndex);
			return;
		}
		if (payload.slotIndex === targetSlotIndex) return;
		// Knob-to-knob move/swap.
		const source = slotsStore.slots[slot].paramPages.find((k) => k.slotIndex === payload.slotIndex);
		if (!source) return;
		const previousOccupant = slotsStore.slots[slot].paramPages.find((k) => k.slotIndex === targetSlotIndex);
		slotsStore.assignParamToPage(slot, targetSlotIndex, source.location, source.moduleIndex, source.paramIndex);
		if (previousOccupant) {
			slotsStore.assignParamToPage(slot, payload.slotIndex, previousOccupant.location, previousOccupant.moduleIndex, previousOccupant.paramIndex);
		}
	}
}
