import { clamp } from '@/utils/math';
import { useDragInteraction } from './useDragInteraction';

const SENSITIVITY = 0.3;

export function useSliderDragInteraction(paramIndex: number, getValue: () => number, onChange: (index: number, value: number) => void) {
	let startValue = 0;
	const { isDragging, onMouseDown, onMouseUp } = useDragInteraction((dy) => {
		const newValue = clamp(Math.round(startValue + dy * SENSITIVITY), 0, 127);
		if (newValue !== getValue()) onChange(paramIndex, newValue);
	});

	function onMouseDownCapture(event: MouseEvent | TouchEvent) {
		startValue = getValue();
		onMouseDown(event);
	}

	return { isDragging, onMouseDown: onMouseDownCapture, onMouseUp };
}
