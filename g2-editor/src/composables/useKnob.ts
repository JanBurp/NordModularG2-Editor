import { computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { clamp } from '@/utils/math';
import { useDragInteraction } from './useDragInteraction';

const RADII: Record<string, number> = { KnobBig: 11, KnobMedium: 10, KnobSmall: 9, KnobReset: 10 };

export function useKnob(value: Ref<number> | ComputedRef<number>, knobType: Ref<string> | ComputedRef<string>, emitChange: (value: number) => void) {
	const radius = computed(() => RADII[knobType.value] ?? 10);
	const angle = computed(() => (value.value / 128) * 270 - 135);
	const isReset = computed(() => knobType.value === 'KnobReset');

	const startValue = { current: 0 };
	const { isDragging, onMouseDown } = useDragInteraction((dy) => {
		const newValue = clamp(Math.round(startValue.current + dy), 0, 127);
		if (newValue !== value.value) emitChange(newValue);
	});

	function onMouseDownCapture(event: MouseEvent | TouchEvent) {
		startValue.current = value.value;
		onMouseDown(event);
	}

	function onDoubleClick(defaultVal = 64) {
		emitChange(defaultVal);
	}

	return { radius, angle, isReset, isDragging, onMouseDown: onMouseDownCapture, onDoubleClick };
}
