import type { ComputedRef, Ref } from 'vue';

import { clamp } from '@/utils/math';
import { computed } from 'vue';
import { useDragInteraction } from './useDragInteraction';
import { useSettingsStore } from '@/store/settings';

const RADII: Record<string, number> = { KnobBig: 11, KnobMedium: 10, KnobSmall: 9, KnobReset: 10 };
const CURSORS: Record<string, string> = { vertical: 'ns-resize', horizontal: 'ew-resize', circular: 'crosshair' };

// Converts a mouse position relative to the knob center to a knob angle in degrees.
// 0° = top (12 o'clock), positive = clockwise, range -180° to 180°.
function posToAngle(dx: number, dy: number): number {
	return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export function useKnob(
	value: Ref<number> | ComputedRef<number>,
	knobType: Ref<string> | ComputedRef<string>,
	emitChange: (value: number) => void,
	elementRef?: Ref<Element | null>,
) {
	const settings = useSettingsStore();
	const radius = computed(() => RADII[knobType.value] ?? 10);
	const angle = computed(() => (value.value / 128) * 270 - 135);
	const isReset = computed(() => knobType.value === 'KnobReset');
	const cursor = computed(() => CURSORS[settings.knobMode] ?? 'ns-resize');

	const startValue = { current: 0 };
	const circular = { cx: 0, cy: 0, prevAngle: 0, accumulated: 0 };

	const { isDragging, onMouseDown } = useDragInteraction((dx, dy, event) => {
		const sensitivity = settings.knobSensitivity * (event.shiftKey ? 0.25 : 1);

		let newValue: number;
		if (settings.knobMode === 'horizontal') {
			newValue = clamp(Math.round(startValue.current + dx * sensitivity), 0, 127);
		} else if (settings.knobMode === 'circular') {
			const clientX = 'touches' in event ? event.touches[0].clientX : (event as MouseEvent).clientX;
			const clientY = 'touches' in event ? event.touches[0].clientY : (event as MouseEvent).clientY;
			const currentAngle = posToAngle(clientX - circular.cx, clientY - circular.cy);
			let angleDelta = currentAngle - circular.prevAngle;
			if (angleDelta > 180) angleDelta -= 360;
			if (angleDelta < -180) angleDelta += 360;
			circular.prevAngle = currentAngle;
			circular.accumulated += angleDelta;
			newValue = clamp(Math.round(startValue.current + (circular.accumulated / 270) * 127 * sensitivity), 0, 127);
		} else {
			newValue = clamp(Math.round(startValue.current + dy * sensitivity), 0, 127);
		}

		if (newValue !== value.value) emitChange(newValue);
	});

	function onMouseDownCapture(event: MouseEvent | TouchEvent) {
		if (settings.knobMode === 'circular') {
			const clickX = 'touches' in event ? event.touches[0].clientX : (event as MouseEvent).clientX;
			const clickY = 'touches' in event ? event.touches[0].clientY : (event as MouseEvent).clientY;

			// Use the knob circle's bounding rect for the center; fall back to click position
			const el = elementRef?.value;
			if (el) {
				const rect = el.getBoundingClientRect();
				circular.cx = rect.left + rect.width / 2;
				circular.cy = rect.top + rect.height / 2;
			} else {
				circular.cx = clickX;
				circular.cy = clickY;
			}

			// Immediately set value based on click angle (absolute mode)
			const clickAngle = posToAngle(clickX - circular.cx, clickY - circular.cy);
			const clickValue = clamp(Math.round(((clickAngle + 135) / 270) * 127), 0, 127);
			startValue.current = clickValue;
			emitChange(clickValue);

			circular.prevAngle = clickAngle;
			circular.accumulated = 0;
		} else {
			startValue.current = value.value;
		}
		onMouseDown(event);
	}

	function onDoubleClick(defaultVal = 64) {
		emitChange(defaultVal);
	}

	return { radius, angle, isReset, isDragging, cursor, onMouseDown: onMouseDownCapture, onDoubleClick };
}
