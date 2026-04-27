import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	patches: {
		list:      (folder: string) => ipcRenderer.invoke("patches:list", folder),
		load:      (filepath: string) => ipcRenderer.invoke("patches:load", filepath),
		setFolder: () => ipcRenderer.invoke("patches:set-folder"),
	},
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
