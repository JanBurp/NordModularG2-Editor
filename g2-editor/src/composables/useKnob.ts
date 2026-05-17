import { ref, computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';

const RADII: Record<string, number> = { KnobBig: 11, KnobMedium: 10, KnobSmall: 9, KnobReset: 10 };

export function useKnob(
	value: Ref<number> | ComputedRef<number>,
	knobType: Ref<string> | ComputedRef<string>,
	emitChange: (value: number) => void,
) {
	const radius = computed(() => RADII[knobType.value] ?? 10);
	const angle = computed(() => (value.value / 128) * 270 - 135);
	const isReset = computed(() => knobType.value === 'KnobReset');

	const isDragging = ref(false);
	const startY = ref(0);
	const startValue = ref(0);

	function onMouseDown(event: MouseEvent | TouchEvent) {
		isDragging.value = true;
		startY.value = 'touches' in event ? event.touches[0].clientY : event.clientY;
		startValue.value = value.value;
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
		const newValue = Math.max(0, Math.min(127, Math.round(startValue.value + deltaY)));
		if (newValue !== value.value) emitChange(newValue);
	}

	function onMouseUp() {
		isDragging.value = false;
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('touchmove', onMouseMove);
		document.removeEventListener('touchend', onMouseUp);
	}

	function onDoubleClick(defaultVal = 64) {
		emitChange(defaultVal);
	}

	return { radius, angle, isReset, isDragging, onMouseDown, onDoubleClick };
}
