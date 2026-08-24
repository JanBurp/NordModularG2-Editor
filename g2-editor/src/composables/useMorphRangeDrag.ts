import { onUnmounted, ref } from 'vue';
import { isGrabModifierPressed } from '@/utils/platform';

const DRAG_THRESHOLD_PX = 3;

export interface MorphDragHandlers {
	isAssigned: () => boolean;
	getRange: () => number;
	onAssign: () => void;
	onDeassign: () => void;
	// Omit (or leave undefined) for params with a fixed range (buttons/switches/spinners) —
	// dragging then has no effect, only the assign/deassign click still works.
	onRangeChange?: (range: number) => void;
}

// Handles the "Ctrl-click a module parameter to assign/deassign it to the selected Morph Group;
// Ctrl-drag an already-assigned knob/slider to set its range" gesture (see the manual excerpt in
// the plan). Both start on the same mousedown and are disambiguated by whether the mouse moved
// past a small threshold before release.
export function useMorphRangeDrag() {
	// Which param is currently being drag-adjusted, and the live hint text to show near it.
	const dragHint = ref<{ paramIndex: number; text: string } | null>(null);
	// Removes the active window listeners without firing the assign/deassign click fallback —
	// used both to guard against a stray previous drag and on component unmount.
	let stopActiveDrag: (() => void) | null = null;

	function startDrag(paramIndex: number, e: MouseEvent, handlers: MorphDragHandlers): void {
		if (!isGrabModifierPressed(e)) return;
		e.preventDefault();
		e.stopPropagation();
		stopActiveDrag?.(); // in case a previous drag never got a mouseup (shouldn't normally happen)

		const startY = e.clientY;
		const startRange = handlers.getRange();
		let moved = false;

		function onMove(ev: MouseEvent) {
			const dy = startY - ev.clientY; // dragging up increases the range
			if (!moved && Math.abs(dy) > DRAG_THRESHOLD_PX) moved = true;
			if (moved && handlers.onRangeChange && handlers.isAssigned()) {
				const newRange = Math.max(-127, Math.min(127, Math.round(startRange + dy)));
				handlers.onRangeChange(newRange);
				dragHint.value = { paramIndex, text: newRange >= 0 ? `+${newRange}` : `${newRange}` };
			}
		}

		function removeListeners() {
			stopActiveDrag = null;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			dragHint.value = null;
		}

		function onUp() {
			const wasMoved = moved;
			removeListeners();
			if (!wasMoved) {
				if (handlers.isAssigned()) handlers.onDeassign();
				else handlers.onAssign();
			}
		}

		stopActiveDrag = removeListeners;
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	// If the component using this composable unmounts mid-drag (e.g. the module is deleted while
	// Ctrl-dragging), drop the listeners without firing the assign/deassign click fallback.
	onUnmounted(() => stopActiveDrag?.());

	return { dragHint, startDrag };
}
