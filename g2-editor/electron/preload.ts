import { contextBridge, ipcRenderer } from "electron";
import type { MenuAction, MenuState } from "../src/types/index";
import type { DeviceStatus } from "../src/store/device";

function now(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/* on/off pair that only removes the listeners registered through it, so unrelated
 * listeners on the same channel are left alone. */
function listenerGroup(channel: string) {
	const wrapped = new Set<(...args: any[]) => void>();
	return {
		on: (handler: (...args: any[]) => void) => {
			const w = (_: unknown, ...args: any[]) => handler(...args);
			wrapped.add(w);
			ipcRenderer.on(channel, w);
		},
		off: () => {
			for (const w of wrapped) ipcRenderer.removeListener(channel, w);
			wrapped.clear();
		},
	};
}

const menuAction = listenerGroup("menu:action");
const openFile = listenerGroup("file:open");
const devicesChanged = listenerGroup("devices:changed");
const watchEvent = listenerGroup("cli:watch-event");
const watchDone = listenerGroup("cli:watch-done");
const deviceDisconnected = listenerGroup("cli:device-disconnected");
const storageChanged = listenerGroup("storage:changed");

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
		storageDir: (custom?: string) => ipcRenderer.invoke("patches:storage-dir", custom),
		storageRemove: (filepath: string) => ipcRenderer.invoke("patches:storage-remove", filepath),
		storageCopy: (from: string, to: string) => ipcRenderer.invoke("patches:storage-copy", from, to),
		onStorageChanged: (cb: () => void) => storageChanged.on(cb),
		offStorageChanged: () => storageChanged.off(),
	},

	loadHelp: (shortName: string) => ipcRenderer.invoke("help:load", shortName),
	loadModuleGraphics: () => ipcRenderer.invoke("modules:load-graphics"),

	onMenuAction: (cb: (action: MenuAction) => void) => menuAction.on(cb),
	offMenuAction: () => menuAction.off(),
	// Registers the listener, then tells main this window can take files (flushes any queued ones).
	onOpenFile: (cb: (filepath: string) => void) => {
		openFile.on(cb);
		ipcRenderer.invoke("app:open-file-ready");
	},
	offOpenFile: () => openFile.off(),
	updateRecentFiles: (files: { path: string; kind: "patch" | "performance" }[]) =>
		ipcRenderer.send("recent-files:update", files),
	updateMenuState: (state: MenuState) => ipcRenderer.send("menu-state:update", state),

	savePatch: (filepath: string, data: number[]) =>
		ipcRenderer.invoke("patch:save", filepath, data),
	showSaveDialog: (defaultName?: string, folder?: string) => ipcRenderer.invoke("patch:save-dialog", defaultName, folder),
	showSavePerfDialog: (defaultName?: string, folder?: string) => ipcRenderer.invoke("perf:save-dialog", defaultName, folder),
	openPatchDialog: (kind?: "patch" | "performance") => ipcRenderer.invoke("patch:open-dialog", kind),
	selectBankFolder: (defaultPath?: string) => ipcRenderer.invoke("bank:select-folder", defaultPath),
	selectPchListFile: () => ipcRenderer.invoke("bank:select-pchlist"),
	getAppInfo: () => ipcRenderer.invoke("app:info"),
	getLatestVersion: () => ipcRenderer.invoke("app:latestVersion"),
	claimStartupSplash: () => ipcRenderer.invoke("app:claim-startup-splash"),
	openExternal: (url: string) => ipcRenderer.send("shell:openExternal", url),
	setTheme: (mode: "system" | "light" | "dark") => ipcRenderer.invoke("theme:set", mode),

	devices: {
		list: () => ipcRenderer.invoke("devices:list"),
		connect: (bus: number, device: number) => ipcRenderer.invoke("devices:connect", bus, device),
		switchTo: (bus: number, device: number) => ipcRenderer.invoke("devices:switch-to", bus, device),
		reportName: (name: string) => ipcRenderer.invoke("devices:report-name", name),
		reportStatus: (status: DeviceStatus) => ipcRenderer.invoke("devices:report-status", status),
		getAssignment: () => ipcRenderer.invoke("devices:get-assignment"),
		onChanged: (
			cb: (list: { id: string; bus: number; device: number; name: string | null; hasDaemon: boolean; status: DeviceStatus }[]) => void,
		) => devicesChanged.on(cb),
		offChanged: () => devicesChanged.off(),
	},
	clipboard: {
		write: (entry: unknown) => ipcRenderer.invoke("clipboard:write", entry),
		read: () => ipcRenderer.invoke("clipboard:read"),
	},
});

/* Formats a command's args for the USB log, replacing any inline byte-array payload
 * (e.g. upload-patch-data) with its length so a patch's raw bytes never flood the log. */
function fmtArgs(args: (string | number[])[]): string {
	return args.map((a) => (Array.isArray(a) ? `<${a.length} bytes>` : a)).join(' ');
}

/* Commands sent but not yet answered, so the renderer can tell when no edit is mid-flight. */
let pending = 0;
function track<T>(p: Promise<T>): Promise<T> {
	pending++;
	return p.finally(() => pending--);
}

contextBridge.exposeInMainWorld("cli", {
	run: (args: (string | number[])[]) => {
		console.log(`[USB] ${now()} → Cmd ${fmtArgs(args)}`);
		return track(ipcRenderer.invoke("cli:run", args));
	},
	runBatch: (argsList: string[][]) => {
		argsList.forEach((a) => console.log(`[USB] ${now()} → Cmd ${a.join(' ')}`));
		return track(ipcRenderer.invoke("cli:run-batch", argsList));
	},
	pending: () => pending,
	watchStart: () => ipcRenderer.invoke("cli:watch-start"),
	watchStop: () => ipcRenderer.send("cli:watch-stop"),
	onWatchEvent: (cb: (line: string) => void) => watchEvent.on(cb),
	offWatchEvent: () => watchEvent.off(),
	onWatchDone: (cb: () => void) => watchDone.on(() => cb()),
	offWatchDone: () => watchDone.off(),
	onDeviceDisconnected: (cb: () => void) => deviceDisconnected.on(() => cb()),
	offDeviceDisconnected: () => deviceDisconnected.off(),
});
