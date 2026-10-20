import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSliderDragInteraction } from '../useSliderDragInteraction';

// No jsdom (environment: 'node'): a minimal document that records the drag's listeners.
const listeners: Record<string, (e: unknown) => void> = {};
beforeEach(() => {
	(globalThis as any).document = {
		addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
		removeEventListener: (type: string) => delete listeners[type],
	};
	vi.spyOn(console, 'warn').mockImplementation(() => {}); // onUnmounted outside a component
});

const down = (y: number) => ({ button: 0, clientX: 0, clientY: y, preventDefault: () => {} }) as unknown as MouseEvent;

describe('useSliderDragInteraction double-click', () => {
	function setup() {
		let value = 50;
		const onChange = vi.fn((_i: number, v: number) => (value = v));
		const slider = useSliderDragInteraction(
			0,
			() => value,
			onChange,
			() => 0,
		);
		return { slider, onChange };
	}

	it('two presses without movement reset to the default', () => {
		const { slider, onChange } = setup();
		slider.onMouseDown(down(100));
		slider.onMouseUp();
		slider.onMouseDown(down(100));
		expect(onChange).toHaveBeenLastCalledWith(0, 0);
	});

	it('a quick second press after a drag that changed the value starts a new drag', () => {
		const { slider, onChange } = setup();
		slider.onMouseDown(down(100));
		listeners.mousemove(down(50));
		slider.onMouseUp();
		onChange.mockClear();
		slider.onMouseDown(down(100));
		expect(onChange).not.toHaveBeenCalled();
	});
});
