import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDeviceStore } from '@/store/device';
import { useUiStore } from '@/store/ui';
import { useStoreInSynthDialog } from '@/composables/useStoreInSynthDialog';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined), runBatch: vi.fn().mockResolvedValue([]) } };
});

// The degraded-uprate toast's Save button stores the slot back where it was loaded from.
describe('saveToOrigin', () => {
	it('stores the patch at the slot origin', async () => {
		useDeviceStore().setStoredLocation('B', 3, 17);
		expect(await useStoreInSynthDialog().saveToOrigin('B')).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['store-patch', '1', '3', '17']);
	});

	it('stores the performance at its origin', async () => {
		useDeviceStore().setStoredLocation('perf', 2, 5);
		expect(await useStoreInSynthDialog().saveToOrigin('perf')).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['store-patch', '4', '2', '5']);
	});

	it('reports failure when the store fails', async () => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('no device'));
		useDeviceStore().setStoredLocation('B', 3, 17);
		expect(await useStoreInSynthDialog().saveToOrigin('B')).toBe(false);
	});

	it('opens the Store in Synth dialog for that slot when the origin is unknown', async () => {
		const dialog = useStoreInSynthDialog();
		expect(await dialog.saveToOrigin('C')).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
		expect(useUiStore().slotInFocus).toBe('C');
		expect(dialog.showDialog.value).toBe(true);
	});
});
