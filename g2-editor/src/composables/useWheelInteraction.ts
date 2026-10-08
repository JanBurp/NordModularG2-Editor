import { useSettingsStore } from '@/store/settings';
import { clamp } from '@/utils/math';

// Amount of accumulated wheel delta needed to move the value by one step (at sensitivity 1).
// Keeps a fast mouse-wheel notch responsive while trackpad scrolling stays smooth.
const WHEEL_DELTA_PER_STEP = 10;

// Generic wheel-to-value-step handler shared by knobs and sliders. Independent of
// KnobMode (vertical/horizontal/circular) since it only reacts to the wheel's deltaY.
export function useWheelInteraction(getValue: () => number, onChange: (value: number) => void) {
	const settings = useSettingsStore();
	let accumulated = 0;

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		accumulated += (settings.wheelReverse ? -event.deltaY : event.deltaY) * settings.wheelSensitivity;
		const steps = Math.trunc(accumulated / WHEEL_DELTA_PER_STEP);
		if (steps === 0) return;
		accumulated -= steps * WHEEL_DELTA_PER_STEP;

		const newValue = clamp(getValue() + steps, 0, 127);
		if (newValue !== getValue()) onChange(newValue);
	}

	return { onWheel };
}
