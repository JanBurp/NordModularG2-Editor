import type { ComputedRef, Ref } from 'vue';
import type { KnobMode } from '@/store/settings';

import { clamp } from '@/utils/math';
import { computed } from 'vue';
import { useDragInteraction } from './useDragInteraction';
import { useWheelInteraction } from './useWheelInteraction';
import { useSettingsStore } from '@/store/settings';
import { knobAngle } from '@/utils/knobArc';
import knobRotateCursor from '@/assets/cursors/knob-rotate.svg';
import { createDoubleClickDetector, isPrimaryMouseDown } from '@/utils/doubleClick';

export const RADII: Record<string, number> = { KnobBig: 11, KnobMedium: 10, KnobSmall: 9, KnobReset: 10 };
export const KNOB_RESET_CENTRE = 64; // value KnobReset's centre marker resets to
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

type Point = { x: number; y: number };

// Linear modes fine-tune by distance perpendicular to the drag axis: at FINE_DISTANCE px beyond the knob's
// edge the same movement does a quarter as much, at 3x that 1/16 (circular gets this from its geometry).
export const FINE_DISTANCE = 100;
export function fineFactor(distance: number, radius: number): number {
	return 1 / (1 + Math.max(0, distance - radius) / FINE_DISTANCE) ** 2;
}

// Value change (in 0..127 units, before sensitivity) for a pointer move from `from` to `to`.
export function knobDragStep(mode: KnobMode, from: Point, to: Point, centre: Point, radius: number): number {
	if (mode === 'circular') {
		let angleDelta = posToAngle(to.x - centre.x, to.y - centre.y) - posToAngle(from.x - centre.x, from.y - centre.y);
		if (angleDelta > 180) angleDelta -= 360;
		if (angleDelta < -180) angleDelta += 360;
		return (angleDelta / 270) * 127;
	}
	if (mode === 'horizontal') return (to.x - from.x) * fineFactor(Math.abs(to.y - centre.y), radius);
	return (from.y - to.y) * fineFactor(Math.abs(to.x - centre.x), radius);
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

	// Incremental: each move adds its step to `acc`, so changing Shift or the distance mid-drag never jumps.
	const drag = { acc: 0, centre: { x: 0, y: 0 }, radius: 0, prev: { x: 0, y: 0 } }; // centre/radius in screen px

	const { isDragging, onMouseDown } = useDragInteraction(
		(_dx, _dy, event, x, y) => {
			// Scaled by max/127 so the full range takes the same mouse distance whatever the param's range,
			// like the original editor (CPnlControl::ClickDragIdleHandler: pixels*max/256).
			const sensitivity = settings.knobSensitivity * (event.shiftKey ? 0.25 : 1) * (maxValue() / 127);
			const to = { x, y };
			drag.acc = clamp(drag.acc + knobDragStep(settings.knobMode, drag.prev, to, drag.centre, drag.radius) * sensitivity, 0, maxValue());
			drag.prev = to;
			const newValue = Math.round(drag.acc);
			if (newValue !== value.value) emitChange(newValue);
		},
		{ pointerLock: () => settings.knobReturnCursor },
	);

	const isDoubleClick = createDoubleClickDetector();

	function onMouseDownCapture(event: MouseEvent | TouchEvent) {
		if (isPrimaryMouseDown(event) && isDoubleClick()) {
			emitChange(getDefault());
			return;
		}
		drag.acc = value.value;
		const clickX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clickY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		drag.prev = { x: clickX, y: clickY };

		// Use the knob circle's bounding rect for the center; fall back to click position
		const el = elementRef?.value;
		if (el) {
			const rect = el.getBoundingClientRect();
			drag.centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
			drag.radius = rect.width / 2;
		} else {
			drag.centre = { x: clickX, y: clickY };
			drag.radius = 0;
		}
		onMouseDown(event);
	}

	// KnobReset triangle (at 12 o'clock): back to the centre, not to the param's default.
	function resetToCenter() {
		emitChange(KNOB_RESET_CENTRE);
	}

	const { onWheel } = useWheelInteraction(() => value.value, emitChange, maxValue);

	return { radius, angle, isReset, isDragging, cursor, onMouseDown: onMouseDownCapture, onWheel, resetToCenter };
}
