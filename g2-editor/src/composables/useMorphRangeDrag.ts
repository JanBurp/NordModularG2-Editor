import { onUnmounted } from 'vue';
import { isGrabModifierPressed } from '@/utils/platform';
import { useUiStore } from '@/store/ui';

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
	const uiStore = useUiStore();
	// Removes the active window listeners without firing the assign/deassign click fallback —
	// used both to guard against a stray previous drag and on component unmount.
	let stopActiveDrag: (() => void) | null = null;

	function startDrag(moduleIndex: number, paramIndex: number, area: 'va' | 'fx', e: MouseEvent, handlers: MorphDragHandlers): void {
		if (!isGrabModifierPressed(e)) return;
		e.preventDefault();
		e.stopPropagation();
		stopActiveDrag?.(); // in case a previous drag never got a mouseup (shouldn't normally happen)

		const startY = e.clientY;
		const startRange = handlers.getRange();
		let moved = false;
		let lastSentRange = startRange;

		function onMove(ev: MouseEvent) {
			const dy = startY - ev.clientY; // dragging up increases the range
			if (!moved && Math.abs(dy) > DRAG_THRESHOLD_PX) moved = true;
			if (moved && handlers.onRangeChange && handlers.isAssigned()) {
				const newRange = Math.max(-127, Math.min(127, Math.round(startRange + dy)));
				// Always keep the on-screen hint live, even when the (clamped) value hasn't
				// changed since the last send — only the device command itself is deduped.
				uiStore.morphDragHint = { moduleIndex, paramIndex, area, text: newRange >= 0 ? `+${newRange}` : `${newRange}` };
				if (newRange === lastSentRange) return;
				lastSentRange = newRange;
				handlers.onRangeChange(newRange);
			}
		}

		function removeListeners() {
			stopActiveDrag = null;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			uiStore.morphDragHint = null;
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

	return { startDrag };
}
