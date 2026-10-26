// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/store/ui';
import { useValueHint, VALUE_HINT_MS } from '../useValueHint';

const a = { moduleIndex: 1, paramIndex: 2, area: 'va' as const };
const b = { moduleIndex: 3, paramIndex: 0, area: 'fx' as const };
const leaveEvent = (buttons = 0) => ({ buttons }) as MouseEvent;

describe('useValueHint', () => {
	let ui: ReturnType<typeof useUiStore>;
	let hint: ReturnType<typeof useValueHint>;

	beforeEach(() => {
		vi.useFakeTimers();
		setActivePinia(createPinia());
		ui = useUiStore();
		hint = useValueHint();
		hint.hide();
	});
	afterEach(() => vi.useRealTimers());

	it('shows a hovered param after the delay and keeps it until leave', () => {
		hint.hoverEnter(a);
		vi.advanceTimersByTime(VALUE_HINT_MS - 1);
		expect(ui.valueHint).toBeNull();
		vi.advanceTimersByTime(1);
		expect(ui.valueHint).toEqual({ ...a, pinned: true });
		vi.advanceTimersByTime(10 * VALUE_HINT_MS);
		expect(ui.valueHint).not.toBeNull();
		hint.leave(leaveEvent());
		expect(ui.valueHint).toBeNull();
	});

	it('leaving before the delay cancels the hover hint', () => {
		hint.hoverEnter(a);
		hint.leave(leaveEvent());
		vi.advanceTimersByTime(VALUE_HINT_MS);
		expect(ui.valueHint).toBeNull();
	});

	it('press pins at once; leave while held is ignored; release hides after the timeout', () => {
		hint.press(a);
		expect(ui.valueHint).toEqual({ ...a, pinned: true });
		hint.leave(leaveEvent(1));
		expect(ui.valueHint).not.toBeNull();
		window.dispatchEvent(new MouseEvent('mouseup'));
		expect(ui.valueHint).toEqual({ ...a, pinned: false });
		vi.advanceTimersByTime(VALUE_HINT_MS);
		expect(ui.valueHint).toBeNull();
	});

	it('a change keeps a pinned hint on the same param, else shows briefly', () => {
		hint.press(a);
		hint.changed(a);
		vi.advanceTimersByTime(VALUE_HINT_MS);
		expect(ui.valueHint).toEqual({ ...a, pinned: true });
		hint.changed(b);
		expect(ui.valueHint).toEqual({ ...b, pinned: false });
		vi.advanceTimersByTime(VALUE_HINT_MS);
		expect(ui.valueHint).toBeNull();
	});

	it('leave does not cut a change hint short', () => {
		hint.changed(b);
		hint.leave(leaveEvent());
		expect(ui.valueHint).toEqual({ ...b, pinned: false });
	});
});
