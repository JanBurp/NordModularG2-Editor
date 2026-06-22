import { contextBridge, ipcRenderer } from "electron";
import type { MenuAction } from "../src/types/index";

function now(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

contextBridge.exposeInMainWorld("electronAPI", {
	isOffline: process.env.VITE_DEV_OFFLINE === 'true',
	patches: {
		list: (folder: string) => ipcRenderer.invoke("patches:list", folder),
		load: (filepath: string) => ipcRenderer.invoke("patches:load", filepath),
		setFolder: () => ipcRenderer.invoke("patches:set-folder"),
		builtinPath: (name: string) => ipcRenderer.invoke("patches:builtin-path", name),
	},

	loadHelp: (shortName: string) => ipcRenderer.invoke("help:load", shortName),

	onMenuAction: (cb: (action: MenuAction) => void) =>
		ipcRenderer.on("menu:action", (_, action) => cb(action as MenuAction)),
	offMenuAction: () => ipcRenderer.removeAllListeners("menu:action"),

	savePatch: (filepath: string, data: number[]) =>
		ipcRenderer.invoke("patch:save", filepath, data),
	showSaveDialog: (defaultName?: string, folder?: string) => ipcRenderer.invoke("patch:save-dialog", defaultName, folder),
	showSavePerfDialog: (defaultName?: string, folder?: string) => ipcRenderer.invoke("perf:save-dialog", defaultName, folder),
	openPatchDialog: () => ipcRenderer.invoke("patch:open-dialog"),
	getAppInfo: () => ipcRenderer.invoke("app:info"),
	openExternal: (url: string) => ipcRenderer.send("shell:openExternal", url),
	setTheme: (mode: "system" | "light" | "dark") => ipcRenderer.invoke("theme:set", mode),
});

contextBridge.exposeInMainWorld("cli", {
	run: (args: string[]) => {
		console.log(`[USB] ${now()} → Cmd ${args.join(' ')}`);
		return ipcRenderer.invoke("cli:run", args);
	},
	runBatch: (argsList: string[][]) => {
		argsList.forEach((a) => console.log(`[USB] ${now()} → Cmd ${a.join(' ')}`));
		return ipcRenderer.invoke("cli:run-batch", argsList);
	},
	watchStart: () => ipcRenderer.invoke("cli:watch-start"),
	watchStop: () => ipcRenderer.send("cli:watch-stop"),
	onWatchEvent: (cb: (line: string) => void) => ipcRenderer.on("cli:watch-event", (_event, line) => cb(line)),
	offWatchEvent: () => ipcRenderer.removeAllListeners("cli:watch-event"),
	onWatchDone: (cb: () => void) => ipcRenderer.on("cli:watch-done", () => cb()),
	offWatchDone: () => ipcRenderer.removeAllListeners("cli:watch-done"),
	onDeviceDisconnected: (cb: () => void) => ipcRenderer.on("cli:device-disconnected", () => cb()),
	offDeviceDisconnected: () => ipcRenderer.removeAllListeners("cli:device-disconnected"),
});
