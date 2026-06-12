import { ref } from 'vue';

export function useDragInteraction(onDelta: (dy: number) => void) {
	const isDragging = ref(false);
	let startY = 0;

	function onMouseDown(event: MouseEvent | TouchEvent) {
		isDragging.value = true;
		startY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		document.addEventListener('touchmove', onMouseMove, { passive: false });
		document.addEventListener('touchend', onMouseUp);
	}

	function onMouseMove(event: MouseEvent | TouchEvent) {
		if (!isDragging.value) return;
		event.preventDefault();
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		onDelta(startY - clientY);
	}

	function onMouseUp() {
		isDragging.value = false;
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('touchmove', onMouseMove);
		document.removeEventListener('touchend', onMouseUp);
	}

	return { isDragging, onMouseDown, onMouseUp };
}
