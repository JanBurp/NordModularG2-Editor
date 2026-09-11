import { contextBridge, ipcRenderer } from "electron";
import type { MenuAction, MenuState } from "../src/types/index";

function now(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

contextBridge.exposeInMainWorld("electronAPI", {
	isOffline: process.env.VITE_DEV_OFFLINE === 'true',
	isMac: process.platform === 'darwin',
	patches: {
		list: (folder: string) => ipcRenderer.invoke("patches:list", folder),
		load: (filepath: string) => ipcRenderer.invoke("patches:load", filepath),
		setFolder: () => ipcRenderer.invoke("patches:set-folder"),
		builtinPath: (name: string) => ipcRenderer.invoke("patches:builtin-path", name),
		initLoadPath: (slot: number) => ipcRenderer.invoke("patches:init-load-path", slot),
		initSavePath: (slot: number) => ipcRenderer.invoke("patches:init-save-path", slot),
	},

	loadHelp: (shortName: string) => ipcRenderer.invoke("help:load", shortName),
	loadModuleGraphics: () => ipcRenderer.invoke("modules:load-graphics"),

	onMenuAction: (cb: (action: MenuAction) => void) =>
		ipcRenderer.on("menu:action", (_, action) => cb(action as MenuAction)),
	offMenuAction: () => ipcRenderer.removeAllListeners("menu:action"),
	updateRecentFiles: (files: { path: string; kind: "patch" | "performance" }[]) =>
		ipcRenderer.send("recent-files:update", files),
	updateMenuState: (state: MenuState) => ipcRenderer.send("menu-state:update", state),

	savePatch: (filepath: string, data: number[]) =>
		ipcRenderer.invoke("patch:save", filepath, data),
	writeTempPatch: (name: string, data: number[]) =>
		ipcRenderer.invoke("patch:write-temp", name, data),
	showSaveDialog: (defaultName?: string, folder?: string) => ipcRenderer.invoke("patch:save-dialog", defaultName, folder),
	showSavePerfDialog: (defaultName?: string, folder?: string) => ipcRenderer.invoke("perf:save-dialog", defaultName, folder),
	openPatchDialog: (kind?: "patch" | "performance") => ipcRenderer.invoke("patch:open-dialog", kind),
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
