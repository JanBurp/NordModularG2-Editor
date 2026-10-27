import { defineStore } from 'pinia';
import type { ConnectedDeviceInfo } from '@/types';

export type { ConnectedDeviceInfo };

// Every device view's summary, in toolbar order (the same in every window), plus which entry is
// this view. Populated from window.electronAPI.devices.onChanged, broadcast by the main process
// whenever any view reports a change.
export const useConnectedDevicesStore = defineStore('connectedDevices', {
	state: () => ({
		list: [] as ConnectedDeviceInfo[],
		selfId: null as number | null,
	}),

	actions: {
		setSelfId(id: number | null) {
			this.selfId = id;
		},

		applyList(list: ConnectedDeviceInfo[]) {
			this.list = list;
		},
	},
});
