import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissToastByKey, useToast } from '@/composables/useToast';

afterEach(() => vi.useRealTimers());

describe('useToast', () => {
	it('regular toasts auto-dismiss, error toasts stay until dismissed', () => {
		vi.useFakeTimers();
		const { toasts, showToast, showErrorToast, dismissToast } = useToast();
		toasts.splice(0);
		showToast('info');
		showErrorToast('error');
		vi.advanceTimersByTime(60_000);
		expect(toasts.map((t) => t.message)).toEqual(['error']);
		dismissToast(toasts[0].id);
		expect(toasts).toHaveLength(0);
	});

	it('an error toast with the key of one still showing is not added again', () => {
		const { toasts, showErrorToast } = useToast();
		toasts.splice(0);
		showErrorToast('first', undefined, 'k');
		showErrorToast('second', undefined, 'k');
		showErrorToast('other');
		expect(toasts.map((t) => t.message)).toEqual(['first', 'other']);
	});

	it('dismissToastByKey removes only the toast with that key', () => {
		const { toasts, showErrorToast } = useToast();
		toasts.splice(0);
		showErrorToast('first', undefined, 'k');
		showErrorToast('other');
		dismissToastByKey('k');
		expect(toasts.map((t) => t.message)).toEqual(['other']);
	});

	it('an error toast action dismisses the toast only when it succeeds', async () => {
		const { toasts, showErrorToast, runToastAction } = useToast();
		toasts.splice(0);
		let ok = false;
		const run = vi.fn(async () => ok);
		showErrorToast('error', { label: 'Save', run });
		await runToastAction(toasts[0]);
		expect(toasts).toHaveLength(1);
		ok = true;
		await runToastAction(toasts[0]);
		expect(run).toHaveBeenCalledTimes(2);
		expect(toasts).toHaveLength(0);
	});
});
