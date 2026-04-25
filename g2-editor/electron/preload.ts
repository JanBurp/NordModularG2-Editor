import { contextBridge, ipcRenderer } from "electron";

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
