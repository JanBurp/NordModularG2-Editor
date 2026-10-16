import { onUnmounted } from 'vue';
import { createDoubleClickDetector } from '@/utils/doubleClick';

export type SpinnerType = 'KnobSpin' | 'KnobSpinH' | 'KnobSpinV' | 'KnobSlider';

export function useSpinnerHoldInteraction(
	type: SpinnerType,
	paramIndex: number,
	getValue: () => number,
	onChange: (index: number, value: number) => void,
	getDefault: () => number,
) {
	const STEP = 1;
	const INITIAL_DELAY = 300;
	const REPEAT_INTERVAL = 50;

	let intervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	function stopRepeat() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	}

	function startRepeat(direction: 1 | -1) {
		intervalId = setInterval(() => {
			const value = getValue();
			const newValue = direction === 1 ? Math.min(127, value + STEP) : Math.max(0, value - STEP);
			onChange(paramIndex, newValue);
		}, REPEAT_INTERVAL);
	}

	const isDoubleClick = createDoubleClickDetector();

	function onMouseDown(event: MouseEvent | TouchEvent) {
		stopRepeat();
		if (isDoubleClick()) {
			onChange(paramIndex, getDefault());
			return;
		}

		const e = event as MouseEvent;
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		let direction: 1 | -1;

		if (type === 'KnobSpin' || type === 'KnobSlider') {
			const halfH = type === 'KnobSpin' ? rect.height / 2 : (rect.height + 44) / 2;
			direction = y < halfH ? 1 : -1;
		} else if (type === 'KnobSpinH' || type === 'KnobSpinV') {
			direction = x < rect.width / 2 ? -1 : 1;
		} else {
			return;
		}

		const value = getValue();
		const newValue = direction === 1 ? Math.min(127, value + STEP) : Math.max(0, value - STEP);
		onChange(paramIndex, newValue);

		timeoutId = setTimeout(() => {
			startRepeat(direction);
			timeoutId = null;
		}, INITIAL_DELAY);

		document.addEventListener('mouseup', onMouseUp, { once: true });
		document.addEventListener('touchend', onMouseUp, { once: true });
		window.addEventListener('blur', onMouseUp, { once: true });
	}

	function onMouseUp() {
		stopRepeat();
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('touchend', onMouseUp);
		window.removeEventListener('blur', onMouseUp);
	}

	onUnmounted(() => {
		onMouseUp();
	});

	return {
		onMouseDown,
		stopRepeat,
	};
}
