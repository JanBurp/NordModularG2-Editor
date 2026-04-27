import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	patches: {
		list:      (folder: string) => ipcRenderer.invoke("patches:list", folder),
		load:      (filepath: string) => ipcRenderer.invoke("patches:load", filepath),
		setFolder: () => ipcRenderer.invoke("patches:set-folder"),
	},

	onMenuAction: (cb: (action: string) => void) =>
		ipcRenderer.on("menu:action", (_, action) => cb(action)),
	offMenuAction: () => ipcRenderer.removeAllListeners("menu:action"),

	savePatch: (filepath: string, data: number[]) =>
		ipcRenderer.invoke("patch:save", filepath, data),
	showSaveDialog: () => ipcRenderer.invoke("patch:save-dialog"),
	openPatchDialog: () => ipcRenderer.invoke("patch:open-dialog"),
});

contextBridge.exposeInMainWorld("cli", {
	run: (args: string[]) => ipcRenderer.invoke("cli:run", args),
	runBatch: (argsList: string[][]) => ipcRenderer.invoke("cli:run-batch", argsList),
	watchStart: () => ipcRenderer.send("cli:watch-start"),
	watchStop: () => ipcRenderer.send("cli:watch-stop"),
	onWatchEvent: (cb: (line: string) => void) =>
		ipcRenderer.on("cli:watch-event", (_event, line) => cb(line)),
	offWatchEvent: () => ipcRenderer.removeAllListeners("cli:watch-event"),
	onWatchDone: (cb: () => void) =>
		ipcRenderer.on("cli:watch-done", () => cb()),
	offWatchDone: () => ipcRenderer.removeAllListeners("cli:watch-done"),
	onDeviceDisconnected: (cb: () => void) =>
		ipcRenderer.on("cli:device-disconnected", () => cb()),
	offDeviceDisconnected: () =>
		ipcRenderer.removeAllListeners("cli:device-disconnected"),
});
