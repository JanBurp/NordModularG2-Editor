import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '@/composables/useToast';

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
