import type { MouseEvent as VueMouseEvent } from 'vue';

export type SpinnerType = 'KnobSpin' | 'KnobSpinH' | 'KnobSlider';

export function useSpinnerClickInteraction(
	type: SpinnerType,
	paramIndex: number,
	getValue: () => number,
	onChange: (index: number, value: number) => void,
) {
	const STEP = 1;

	function onClick(event: MouseEvent | TouchEvent) {
		const e = event as VueMouseEvent;
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const value = getValue();

		if (type === 'KnobSpin' || type === 'KnobSlider') {
			if (y < rect.height / 2) {
				onChange(paramIndex, Math.min(127, value + STEP));
			} else {
				onChange(paramIndex, Math.max(0, value - STEP));
			}
		} else if (type === 'KnobSpinH') {
			if (x < rect.width / 2) {
				onChange(paramIndex, Math.max(0, value - STEP));
			} else {
				onChange(paramIndex, Math.min(127, value + STEP));
			}
		}
	}

	function onDoubleClick() {
		onChange(paramIndex, 64);
	}

	return {
		onClick,
		onDoubleClick,
	};
}
