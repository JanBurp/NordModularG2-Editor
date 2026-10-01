import { reactive, readonly } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

export interface ParamDragPayload {
	location: 0 | 1;
	moduleIndex: number;
	paramIndex: number;
	label: string;
}

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

// Canvas param -> Parameter Pages toolbar knob, as a custom pointer-tracked drag: native HTML5
// drag-and-drop never reliably starts a drag session FROM the canvas's SVG <g> param elements
// (Chromium's drag-source recognition is flaky for SVG), so this sidesteps the browser's
// recognition entirely — mouse tracking plus elementFromPoint on release.
//
// The opposite direction (toolbar knob -> canvas param) does use native DnD, in ParameterPages.vue:
// there the drag source is plain HTML, which Chromium handles fine, and the SVG side only has to be
// a drop target — the same HTML-source/SVG-target path MidiCCPane.vue has always used successfully.
export function startParamPageDrag(e: MouseEvent, payload: ParamDragPayload) {
	e.preventDefault();
	e.stopPropagation();
	if (state.active) return; // a drag is already running (its listeners are still attached)
	state.active = true;
	state.payload = payload;
	state.x = e.clientX;
	state.y = e.clientY;

	function end() {
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
		document.removeEventListener('keydown', onKey, true);
		window.removeEventListener('blur', end);
		state.active = false;
		state.payload = null;
	}
	function onMove(ev: MouseEvent) {
		state.x = ev.clientX;
		state.y = ev.clientY;
	}
	function onUp(ev: MouseEvent) {
		end();
		const target = document.elementFromPoint(ev.clientX, ev.clientY);
		if (target) handleDrop(target, payload);
	}
	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'Escape') end();
	}
	document.addEventListener('mousemove', onMove);
	document.addEventListener('mouseup', onUp);
	document.addEventListener('keydown', onKey, true);
	window.addEventListener('blur', end);
}

function handleDrop(target: Element, payload: ParamDragPayload) {
	const slot = useUiStore().slotInFocus;
	if (!slot) return;

	// Dropped anywhere on a Parameter Pages column (ParameterPagesGroup.vue's cell, tagged data-cell-slot)?
	// data-cell-global marks a Global Pages cell (present only while the toolbar's Global Pages
	// toggle is on) vs. the default per-Patch cell.
	let cellEl: Element | null = target;
	while (cellEl && !cellEl.hasAttribute('data-cell-slot')) cellEl = cellEl.parentElement;
	if (!cellEl) return;
	const slotIndex = parseInt(cellEl.getAttribute('data-cell-slot') ?? '');
	if (isNaN(slotIndex)) return;
	if (cellEl.hasAttribute('data-cell-global')) {
		useSlotsStore().assignParamToGlobalPage(slot, slotIndex, payload.location, payload.moduleIndex, payload.paramIndex);
	} else {
		useSlotsStore().assignParamToPage(slot, slotIndex, payload.location, payload.moduleIndex, payload.paramIndex);
	}
}
