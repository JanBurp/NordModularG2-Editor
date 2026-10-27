import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConnectedDevicesStore, type ConnectedDeviceInfo } from '@/store/connectedDevices';
import { DeviceStatus } from '@/store/device';

function makeDevice(viewId: number, overrides: Partial<ConnectedDeviceInfo> = {}): ConnectedDeviceInfo {
	return {
		viewId,
		detached: false,
		name: null,
		status: DeviceStatus.Connected,
		perfMode: false,
		selectedSlot: 0,
		slotsActive: [true, false, false, false],
		slotsKeyed: [true, false, false, false],
		...overrides,
	};
}

beforeEach(() => {
	setActivePinia(createPinia());
});

describe('connectedDevices store', () => {
	it('setSelfId/applyList update state directly, keeping the broadcast order', () => {
		const store = useConnectedDevicesStore();
		store.setSelfId(7);
		store.applyList([makeDevice(9), makeDevice(7)]);

		expect(store.selfId).toBe(7);
		expect(store.list.map((d) => d.viewId)).toEqual([9, 7]);
	});
});
