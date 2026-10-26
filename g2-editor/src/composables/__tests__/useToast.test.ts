import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliErrorText, dismissToastByKey, useToast } from '@/composables/useToast';

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

	it('cliErrorText drops the IPC prefix and words a G2 flash refusal for the action', () => {
		const ipc = (m: string) => new Error(`Error invoking remote method 'cli:run': Error: ${m}`);
		expect(cliErrorText(ipc('store-patch: device refused 32-120 (Memory protect on)'), 'Save')).toBe('Save failed at 32-120: Memory protect on');
		expect(cliErrorText(ipc('clear-patch: device refused 1-7 (Flash memory full)'), 'Clear')).toBe('Clear failed at 1-7: Flash memory full');
		expect(cliErrorText(ipc('clear-bank: device refused bank 32 (Memory protect on)'), 'Clear')).toBe('Clear failed at bank 32: Memory protect on');
		expect(cliErrorText(ipc('no response from the G2'), 'Save')).toBe('no response from the G2');
		expect(cliErrorText(ipc('store-patch: device refused 32-120 (Memory protect on)'))).toBe('store-patch: device refused 32-120 (Memory protect on)');
		expect(cliErrorText(new Error('plain'))).toBe('plain');
	});
});
