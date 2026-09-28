import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConnectedDevicesStore, type ConnectedDeviceInfo } from '@/store/connectedDevices';
import { DeviceStatus } from '@/store/device';

function makeDevice(id: string, overrides: Partial<ConnectedDeviceInfo> = {}): ConnectedDeviceInfo {
	return { id, bus: 1, device: 1, name: null, hasDaemon: true, status: DeviceStatus.Connected, ...overrides };
}

beforeEach(() => {
	setActivePinia(createPinia());
});

describe('connectedDevices store', () => {
	it('setThisId/applyList update state directly', () => {
		const store = useConnectedDevicesStore();
		store.setThisId('1:2');
		store.applyList([makeDevice('1:2'), makeDevice('3:4')]);

		expect(store.thisId).toBe('1:2');
		expect(store.list).toHaveLength(2);
	});

	// Regression test for the DeviceSwitcher self-listing flash: its "other devices" list is
	// `store.list.filter((d) => d.id !== store.thisId)` — this window's own device must never
	// appear as a switch target once thisId is set.
	it('a device matching thisId is excluded by DeviceSwitcher-style filtering', () => {
		const store = useConnectedDevicesStore();
		store.setThisId('1:2');
		store.applyList([makeDevice('1:2'), makeDevice('3:4')]);

		const otherDevices = store.list.filter((d) => d.id !== store.thisId);

		expect(otherDevices.map((d) => d.id)).toEqual(['3:4']);
	});

	it('every device is "other" while thisId is still null (the pre-fix race condition)', () => {
		const store = useConnectedDevicesStore();
		store.applyList([makeDevice('1:2'), makeDevice('3:4')]);

		const otherDevices = store.list.filter((d) => d.id !== store.thisId);

		expect(otherDevices).toHaveLength(2);
	});
});
