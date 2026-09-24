import { useDragInteraction } from './useDragInteraction';

// Click/drag → absolute row, not delta-based like useSliderDragInteraction: wherever the pointer
// currently is maps directly to a row, via the target element's own screen transform (so it works
// regardless of canvas pan/zoom). Reports the local Y coordinate (in the target's own coordinate
// space) on mousedown and on every subsequent move; the caller turns that into a note value.
export function usePianoRollNoteInteraction(onLocalY: (localY: number) => void) {
	let activeTarget: SVGGraphicsElement | null = null;

	function localYFromEvent(event: MouseEvent | TouchEvent): number {
		if (!activeTarget) return 0;
		const clientX = 'touches' in event ? (event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX ?? 0) : event.clientX;
		const clientY = 'touches' in event ? (event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? 0) : event.clientY;
		const ctm = activeTarget.getScreenCTM();
		if (!ctm) return 0;
		return new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse()).y;
	}

	const drag = useDragInteraction((_dx, _dy, event) => onLocalY(localYFromEvent(event)));

	function onMouseDown(event: MouseEvent | TouchEvent) {
		activeTarget = event.currentTarget as SVGGraphicsElement;
		onLocalY(localYFromEvent(event));
		drag.onMouseDown(event);
	}

	return { onMouseDown, isDragging: drag.isDragging };
}
