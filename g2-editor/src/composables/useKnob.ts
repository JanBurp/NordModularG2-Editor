import type { ComputedRef, Ref } from 'vue';

import { clamp } from '@/utils/math';
import { computed } from 'vue';
import { useDragInteraction } from './useDragInteraction';
import { useWheelInteraction } from './useWheelInteraction';
import { useSettingsStore } from '@/store/settings';
import { knobAngle } from '@/utils/knobArc';
import knobRotateCursor from '@/assets/cursors/knob-rotate.svg';
import { createDoubleClickDetector } from '@/utils/doubleClick';

export const RADII: Record<string, number> = { KnobBig: 11, KnobMedium: 10, KnobSmall: 9, KnobReset: 10 };
const CURSORS: Record<string, string> = {
	vertical: 'ns-resize',
	horizontal: 'ew-resize',
	circular: `url("${knobRotateCursor}") 12 12, crosshair`,
};

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
	max?: Ref<number> | ComputedRef<number>, // param's own range (parammap `high`), default 0..127
	getDefault: () => number = () => 64,
) {
	const settings = useSettingsStore();
	const maxValue = () => max?.value ?? 127;
	const radius = computed(() => RADII[knobType.value] ?? 10);
	const angle = computed(() => knobAngle(value.value, maxValue()));
	const isReset = computed(() => knobType.value === 'KnobReset');
	const cursor = computed(() => CURSORS[settings.knobMode] ?? 'ns-resize');

	const startValue = { current: 0 };
	const circular = { cx: 0, cy: 0, prevAngle: 0, accumulated: 0 };

	const { isDragging, onMouseDown } = useDragInteraction((dx, dy, event) => {
		// Scaled by max/127 so the full range takes the same mouse distance whatever the param's range,
		// like the original editor (CPnlControl::ClickDragIdleHandler: pixels*max/256).
		const sensitivity = settings.knobSensitivity * (event.shiftKey ? 0.25 : 1) * (maxValue() / 127);

		let newValue: number;
		if (settings.knobMode === 'horizontal') {
			newValue = clamp(Math.round(startValue.current + dx * sensitivity), 0, maxValue());
		} else if (settings.knobMode === 'circular') {
			const clientX = 'touches' in event ? event.touches[0].clientX : (event as MouseEvent).clientX;
			const clientY = 'touches' in event ? event.touches[0].clientY : (event as MouseEvent).clientY;
			const currentAngle = posToAngle(clientX - circular.cx, clientY - circular.cy);
			let angleDelta = currentAngle - circular.prevAngle;
			if (angleDelta > 180) angleDelta -= 360;
			if (angleDelta < -180) angleDelta += 360;
			circular.prevAngle = currentAngle;
			circular.accumulated += angleDelta;
			newValue = clamp(Math.round(startValue.current + (circular.accumulated / 270) * 127 * sensitivity), 0, maxValue());
		} else {
			newValue = clamp(Math.round(startValue.current + dy * sensitivity), 0, maxValue());
		}

		if (newValue !== value.value) emitChange(newValue);
	});

	const isDoubleClick = createDoubleClickDetector();

	function onMouseDownCapture(event: MouseEvent | TouchEvent) {
		if (isDoubleClick()) {
			emitChange(getDefault());
			return;
		}
		startValue.current = value.value;
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

			// Relative mode: the click itself doesn't change the value, only the rotation while dragging does
			circular.prevAngle = posToAngle(clickX - circular.cx, clickY - circular.cy);
			circular.accumulated = 0;
		}
		onMouseDown(event);
	}

	// KnobReset triangle (at 12 o'clock): back to the centre, not to the param's default.
	function resetToCenter() {
		emitChange(64);
	}

	const { onWheel } = useWheelInteraction(() => value.value, emitChange, maxValue);

	return { radius, angle, isReset, isDragging, cursor, onMouseDown: onMouseDownCapture, onWheel, resetToCenter };
}
