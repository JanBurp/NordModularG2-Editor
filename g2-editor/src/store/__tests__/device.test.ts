import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDeviceStore, DeviceStatus } from '@/store/device';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined) } };
});

describe('sendControllerSnapshot — Send Controller Snapshot', () => {
	it('sends send-controller-snapshot when connected', async () => {
		const store = useDeviceStore();
		store.status = DeviceStatus.Connected;

		const result = await store.sendControllerSnapshot();

		expect(result).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['send-controller-snapshot']);
	});

	it('no-ops when not connected', async () => {
		const store = useDeviceStore();
		store.status = DeviceStatus.Disconnected;

		const result = await store.sendControllerSnapshot();

		expect(result).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('returns false when the CLI call fails', async () => {
		const store = useDeviceStore();
		store.status = DeviceStatus.Connected;
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('USB error'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await store.sendControllerSnapshot();

		expect(result).toBe(false);
		vi.restoreAllMocks();
	});
});
