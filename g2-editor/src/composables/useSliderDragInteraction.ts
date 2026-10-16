import { clamp } from '@/utils/math';
import { useDragInteraction } from './useDragInteraction';
import { createDoubleClickDetector } from '@/utils/doubleClick';

const SENSITIVITY = 0.3;

export function useSliderDragInteraction(
	paramIndex: number,
	getValue: () => number,
	onChange: (index: number, value: number) => void,
	getDefault: () => number,
) {
	let startValue = 0;
	const { isDragging, onMouseDown, onMouseUp } = useDragInteraction((_dx, dy) => {
		const newValue = clamp(Math.round(startValue + dy * SENSITIVITY), 0, 127);
		if (newValue !== getValue()) onChange(paramIndex, newValue);
	});

	const isDoubleClick = createDoubleClickDetector();

	function onMouseDownCapture(event: MouseEvent | TouchEvent) {
		if (isDoubleClick()) {
			onChange(paramIndex, getDefault());
			return;
		}
		startValue = getValue();
		onMouseDown(event);
	}

	return { isDragging, onMouseDown: onMouseDownCapture, onMouseUp };
}
