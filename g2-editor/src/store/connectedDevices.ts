import { defineStore } from 'pinia';

export interface ConnectedDeviceInfo {
	id: string;
	bus: number;
	device: number;
	name: string | null;
	hasDaemon: boolean;
}

// Cross-window "who else is connected" list (one Electron BrowserWindow per physical G2 —
// see the multi-device plan). Populated from window.electronAPI.devices.onChanged, broadcast
// by the main process whenever any window's session changes.
export const useConnectedDevicesStore = defineStore('connectedDevices', {
	state: () => ({
		list: [] as ConnectedDeviceInfo[],
		thisId: null as string | null,
	}),

	actions: {
		setThisId(id: string | null) {
			this.thisId = id;
		},

		applyList(list: ConnectedDeviceInfo[]) {
			this.list = list;
		},
	},
});
