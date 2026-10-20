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

describe('toggleSlotActive — keyboard hand-off', () => {
	const slot = (s: string, active: boolean, key: boolean) => ({ slot: s, active, key, hold: false, range: { lower: 0, upper: 127 } });

	it('deselecting the keyed slot moves the keyboard to the first slot still selected, with one command', () => {
		const store = useDeviceStore();
		store.status = DeviceStatus.Connected;
		store.device = { slots: [slot('A', true, true), slot('B', false, false), slot('C', true, false), slot('D', true, false)] } as any;

		store.toggleSlotActive('A');

		expect(store.device!.slots.map((s) => [s.slot, s.active, s.key])).toEqual([
			['A', false, false],
			['B', false, false],
			['C', true, true],
			['D', true, false],
		]);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledTimes(1);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['set-slot-enabled', 'A', '0']);
	});

	it('deselecting an unkeyed slot leaves the keyboard alone', () => {
		const store = useDeviceStore();
		store.device = { slots: [slot('A', true, true), slot('B', true, false)] } as any;

		store.toggleSlotActive('B');

		expect(store.device!.slots.map((s) => s.key)).toEqual([true, false]);
	});
});

describe('updateSynthSettings — remembered performance origin', () => {
	const ev = (perfBank: number, perfLoc: number) => ({ synthName: 'G2', mode: 'Performance', perfBank, perfLoc, midi: {}, tuning: {}, pedal: {} }) as any;

	it('forgets the origin when another performance is selected on the G2', () => {
		const store = useDeviceStore();
		store.device = { perfBank: 2, perfLoc: 6 } as any;
		store.setStoredLocation('perf', 3, 7);

		store.updateSynthSettings(ev(4, 1));

		expect(store.storedLocation.perf).toBeUndefined();
	});

	it('keeps the origin for the echo of our own select, and when the location is unchanged', () => {
		const store = useDeviceStore();
		store.device = { perfBank: 0, perfLoc: 0 } as any;
		store.setStoredLocation('perf', 3, 7);

		store.updateSynthSettings(ev(2, 6));
		store.updateSynthSettings(ev(2, 6));

		expect(store.storedLocation.perf).toEqual({ bank: 3, location: 7 });
	});
});
