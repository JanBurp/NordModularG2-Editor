import { onUnmounted, ref } from 'vue';
import { clamp } from '@/utils/math';

// onDelta gets the offset from the drag start plus the current pointer position (x, y).
// With options.pointerLock the OS cursor is hidden and stays at the drag start (where it reappears on release);
// x/y then track a virtual pointer built from movementX/Y, clamped to the window, published in `lockedPointer`
// (one per document, like the lock itself) for KnobDragCursor.vue to draw.
export const lockedPointer = ref<{ x: number; y: number } | null>(null);

export function useDragInteraction(
	onDelta: (dx: number, dy: number, event: MouseEvent | TouchEvent, x: number, y: number) => void,
	options: { pointerLock?: () => boolean } = {},
) {
	const isDragging = ref(false);
	let startX = 0;
	let startY = 0;
	let x = 0;
	let y = 0;

	function onMouseDown(event: MouseEvent | TouchEvent) {
		isDragging.value = true;
		startX = x = 'touches' in event ? event.touches[0].clientX : event.clientX;
		startY = y = 'touches' in event ? event.touches[0].clientY : event.clientY;
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		document.addEventListener('touchmove', onMouseMove, { passive: false });
		document.addEventListener('touchend', onMouseUp);
		if (!('touches' in event) && options.pointerLock?.()) {
			document.addEventListener('pointerlockchange', onPointerLockChange);
			// Returns a Promise in current Chromium; a refused lock just leaves the drag unlocked,
			// a lock granted after a quick release is dropped again.
			Promise.resolve(document.body.requestPointerLock())
				.then(() => {
					if (!isDragging.value && document.pointerLockElement) document.exitPointerLock();
				})
				.catch(() => {});
		}
	}

	function onMouseMove(event: MouseEvent | TouchEvent) {
		if (!isDragging.value) return;
		event.preventDefault();
		if ('touches' in event) {
			x = event.touches[0].clientX;
			y = event.touches[0].clientY;
		} else if (document.pointerLockElement) {
			x = clamp(x + event.movementX, 0, window.innerWidth - 1);
			y = clamp(y + event.movementY, 0, window.innerHeight - 1);
			lockedPointer.value = { x, y };
		} else {
			x = event.clientX;
			y = event.clientY;
		}
		onDelta(x - startX, startY - y, event, x, y);
	}

	// Lock lost while still dragging (e.g. Esc) ends the drag.
	function onPointerLockChange() {
		if (document.pointerLockElement) lockedPointer.value = { x, y };
		else onMouseUp();
	}

	function onMouseUp() {
		if (isDragging.value) {
			// lockedPointer is shared; only the dragging instance may clear it (onUnmounted calls this on every instance).
			lockedPointer.value = null;
			if (document.pointerLockElement) document.exitPointerLock();
		}
		isDragging.value = false;
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('touchmove', onMouseMove);
		document.removeEventListener('touchend', onMouseUp);
		document.removeEventListener('pointerlockchange', onPointerLockChange);
	}

	onUnmounted(() => {
		onMouseUp();
	});

	return { isDragging, onMouseDown, onMouseUp };
}
