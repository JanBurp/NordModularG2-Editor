import { ref } from 'vue';

export function useSliderDragInteraction(
	paramIndex: number,
	getValue: () => number,
	onChange: (index: number, value: number) => void,
) {
	const isDragging = ref(false);
	const startY = ref(0);
	const startValue = ref(0);

	function onMouseDown(event: MouseEvent | TouchEvent) {
		isDragging.value = true;
		startY.value = 'touches' in event ? event.touches[0].clientY : event.clientY;
		startValue.value = getValue();

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		document.addEventListener('touchmove', onMouseMove, { passive: false });
		document.addEventListener('touchend', onMouseUp);
	}

	function onMouseMove(event: MouseEvent | TouchEvent) {
		if (!isDragging.value) return;
		event.preventDefault();

		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		const deltaY = startY.value - clientY;
		const sensitivity = 0.3;
		const newValue = Math.max(0, Math.min(127, Math.round(startValue.value + deltaY * sensitivity)));

		if (newValue !== getValue()) {
			onChange(paramIndex, newValue);
		}
	}

	function onMouseUp() {
		isDragging.value = false;
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('touchmove', onMouseMove);
		document.removeEventListener('touchend', onMouseUp);
	}

	return {
		isDragging,
		onMouseDown,
		onMouseUp,
	};
}
