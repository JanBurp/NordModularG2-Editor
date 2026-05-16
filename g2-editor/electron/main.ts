import { BrowserWindow, app, ipcMain, dialog, Menu } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..", "..");

export const VITE_DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;
let daemonProcess: ChildProcess | null = null;
let cmdId = 0;
const pendingCmds = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
const isMac = process.platform === 'darwin';

const cliPath = path.join(process.env.APP_ROOT, "resources/g2-cli");

function createWindow() {
	win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	win.maximize();
	win.show();

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"));
	}
}

function startDaemon() {
	if (daemonProcess) return;
	if (!fs.existsSync(cliPath)) {
		console.log("[daemon] CLI binary not found at", cliPath, "— skipping daemon start");
		return;
	}
	const proc = spawn(cliPath, ["daemon"]);
	daemonProcess = proc;
	let buffer = "";
	proc.stdout?.on("data", (data: Buffer) => {
		buffer += data.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			console.log(`[daemon-watch]`, line);
			try {
				const msg = JSON.parse(trimmed);
				if (msg.id !== undefined) {
					const pending = pendingCmds.get(msg.id);
					if (pending) {
						clearTimeout(pending.timeout);
						pendingCmds.delete(msg.id);
						if (msg.ok) {
							pending.resolve(msg.data ? JSON.stringify(msg.data) : "");
						} else {
							pending.reject(new Error(`G2 error code: ${msg.code}`));
						}
					}
				} else {
					win?.webContents.send("cli:watch-event", trimmed);
				}
			} catch {
				win?.webContents.send("cli:watch-event", trimmed);
			}
		}
	});
	proc.stderr?.on("data", (data: Buffer) => {
		console.log(`[daemon-error] ${data.toString().trim()}`);
	});
	proc.on("close", (code) => {
		const wasActive = daemonProcess === proc;
		if (wasActive) daemonProcess = null;
		for (const pending of pendingCmds.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Daemon exited"));
		}
		pendingCmds.clear();
		if (!wasActive) return;
		if (code !== null && code !== 0) {
			win?.webContents.send("cli:device-disconnected");
		} else {
			win?.webContents.send("cli:watch-done");
		}
	});
}

async function stopDaemon(): Promise<void> {
	if (!daemonProcess) return;
	const proc = daemonProcess;
	daemonProcess = null;
	return new Promise<void>((resolve) => {
		proc.on("close", () => resolve());
		proc.kill("SIGTERM");
	});
}

function sendCmd(cmd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!daemonProcess) {
			reject(new Error("Daemon not running"));
			return;
		}
		const id = ++cmdId;
		const timeout = setTimeout(() => {
			pendingCmds.delete(id);
			reject(new Error(`CLI timeout: ${cmd}`));
		}, 30_000);
		pendingCmds.set(id, { resolve, reject, timeout });
		const json = JSON.stringify({ id, cmd, args });
		console.log('[deamon-cmd]->', json);
		daemonProcess.stdin?.write(json + "\n");
	});
}

ipcMain.handle("cli:run", async (_, args: string[]) => {
	const [cmd, ...rest] = args;
	if (cmd === "disconnect") { await stopDaemon(); return ""; }
	return await sendCmd(cmd, rest);
});

ipcMain.handle("cli:run-batch", async (_, argsList: string[][]) => {
	const results: string[] = [];
	for (const args of argsList) {
		const [cmd, ...rest] = args;
		results.push(await sendCmd(cmd, rest));
	}
	return results;
});

ipcMain.handle("cli:watch-start", () => { startDaemon(); });
ipcMain.on("cli:watch-stop", () => { stopDaemon(); });

ipcMain.handle("patches:list", async (_, folder: string) => {
	try {
		const names = fs.readdirSync(folder).sort();
		const entries = names.map((name) => {
			const full = path.join(folder, name);
			const isDir = fs.statSync(full).isDirectory();
			return { name, path: full, isDir };
		}).filter((e) => e.isDir || e.name.endsWith(".pch2") || e.name.endsWith(".prf2"));
		return { success: true, entries };
	} catch (e: any) {
		return { success: false, error: e.message, entries: [] };
	}
});

ipcMain.handle("patches:load", async (_, filepath: string) => {
	try {
		const buf = fs.readFileSync(filepath);
		return { success: true, data: Array.from(buf) };
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("patches:set-folder", async (event) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(browserWin!, {
		properties: ["openDirectory"],
	});
	if (result.canceled || !result.filePaths[0]) return { success: false };
	return { success: true, folder: result.filePaths[0] };
});

ipcMain.handle("patch:save", async (_, filepath: string, data: number[]) => {
	fs.writeFileSync(filepath, Buffer.from(data));
});

ipcMain.handle("patch:save-dialog", async (event, defaultName?: string) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showSaveDialog(browserWin!, {
		filters: [{ name: "Patch Files", extensions: ["pch2"] }],
		defaultPath: defaultName ? `${defaultName}.pch2` : "patch.pch2",
	});
	if (result.canceled || !result.filePath) return { success: false };
	return { success: true, filepath: result.filePath };
});

ipcMain.handle("patch:open-dialog", async (event) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(browserWin!, {
		filters: [{ name: "Patch Files", extensions: ["pch2", "prf2"] }],
		properties: ["openFile"],
	});
	if (result.canceled || !result.filePaths[0]) return { success: false };
	const filepath = result.filePaths[0];
	const buf = fs.readFileSync(filepath);
	return { success: true, filepath, data: Array.from(buf) };
});

app.on("before-quit", (e) => {
	e.preventDefault();
	(async () => {
		// await stopWatchAndWait();
		// try { await runCliRaw(["disconnect"]); } catch { /* already disconnected */ }
		await stopDaemon();
		app.exit(0);
	})();
});

app.whenReady().then(async () => {
	if (VITE_DEV_SERVER_URL) {
		try {
			const name = await installExtension(VUEJS_DEVTOOLS);
			console.log(`Added Extension: ${name}`);
		} catch (err) {
			console.log("An error occurred while installing Vue DevTools:", err);
		}
	}

	createWindow();

	const template: Electron.MenuItemConstructorOptions[] = [
		...(isMac ? [{
			label: "G2 Editor",
			submenu: [
				{ role: "about" as const },
				{ type: "separator" as const },
				{ role: "services" as const },
				{ type: "separator" as const },
				{ role: "hide" as const },
				{ role: "hideOthers" as const },
				{ role: "unhide" as const },
				{ type: "separator" as const },
				{ role: "quit" as const },
			],
		}] : []),
		{
			label: "File",
			submenu: [
				{ label: "New Patch", click: () => win!.webContents.send("menu:action", "new-patch"), accelerator: "CommandOrControl+N" },
				{ label: "New Performance", click: () => win!.webContents.send("menu:action", "new-performance") },
				{ type: "separator" as const },
				{ label: "Open", click: () => win!.webContents.send("menu:action", "open"), accelerator: "CommandOrControl+O" },
				{ type: "separator" as const },
				{ label: "Save", click: () => win!.webContents.send("menu:action", "save"), accelerator: "CommandOrControl+S" },
				{ label: "Save As", click: () => win!.webContents.send("menu:action", "save-as"), accelerator: "Shift+CommandOrControl+S" },
				{ label: "Save All", click: () => win!.webContents.send("menu:action", "save-all") },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ label: "Delete", click: () => win!.webContents.send("menu:action", "delete") },
				{ label: "Select All", click: () => win!.webContents.send("menu:action", "select-all") },
			],
		},
		{
			label: "View",
			submenu: [
				{ label: "Modules", click: () => win!.webContents.send("menu:action", "toggle-modules"), accelerator: "CommandOrControl+M" },
				{ label: "Browser", click: () => win!.webContents.send("menu:action", "toggle-browser"), accelerator: "CommandOrControl+B" },
				{ label: "Info", click: () => win!.webContents.send("menu:action", "toggle-info"), accelerator: "CommandOrControl+I" },
				{ type: "separator" as const },
				{ label: "Voice Area", click: () => win!.webContents.send("menu:action", "area-voice"), accelerator: "Option+V" },
				{ label: "FX Area", click: () => win!.webContents.send("menu:action", "area-fx"), accelerator: "Option+F" },
				{ type: "separator" as const },
				{ label: "Slot A", click: () => win!.webContents.send("menu:action", "slot-A"), accelerator: "Option+A" },
				{ label: "Slot B", click: () => win!.webContents.send("menu:action", "slot-B"), accelerator: "Option+B" },
				{ label: "Slot C", click: () => win!.webContents.send("menu:action", "slot-C"), accelerator: "Option+C" },
				{ label: "Slot D", click: () => win!.webContents.send("menu:action", "slot-D"), accelerator: "Option+D" },
				{ type: "separator" as const },
				{ label: "Variation 1", click: () => win!.webContents.send("menu:action", "variation-1"), accelerator: "Option+1" },
				{ label: "Variation 2", click: () => win!.webContents.send("menu:action", "variation-2"), accelerator: "Option+2" },
				{ label: "Variation 3", click: () => win!.webContents.send("menu:action", "variation-3"), accelerator: "Option+3" },
				{ label: "Variation 4", click: () => win!.webContents.send("menu:action", "variation-4"), accelerator: "Option+4" },
				{ label: "Variation 5", click: () => win!.webContents.send("menu:action", "variation-5"), accelerator: "Option+5" },
				{ label: "Variation 6", click: () => win!.webContents.send("menu:action", "variation-6"), accelerator: "Option+6" },
				{ label: "Variation 7", click: () => win!.webContents.send("menu:action", "variation-7"), accelerator: "Option+7" },
				{ label: "Variation 8", click: () => win!.webContents.send("menu:action", "variation-8"), accelerator: "Option+8" },
				{ type: "separator" as const },
				{ label: "Toggle DevTools", role: "toggleDevTools" as const, accelerator: "CommandOrControl+Shift+I" },
				{ label: "ShowSVG", click: () => win!.webContents.send("menu:action", "toggle-svg-viewer") },
				{ type: "separator" as const },
				{ role: "zoomIn" as const },
				{ role: "zoomOut" as const },
				{ role: "resetZoom" as const },
			],
		},
		{
			label: "Help",
			submenu: [
				{ role: "about" as const },
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});
