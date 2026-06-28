import { BrowserWindow, app, ipcMain, dialog, Menu, shell, nativeTheme } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

if (process.env.TEST_USER_DATA) {
	app.setPath('userData', process.env.TEST_USER_DATA);
}

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
const platformNames: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
const platformLabel = `${platformNames[process.platform] ?? process.platform} ${process.getSystemVersion()}`;

const cliName = process.platform === "win32" ? "g2-cli.exe" : "g2-cli";
const cliPath = app.isPackaged
	? path.join(process.resourcesPath, cliName)
	: path.join(process.env.APP_ROOT!, "resources", cliName);

function createWindow() {
	const headless = process.env.HEADLESS === '1';
	win = new BrowserWindow({
		width: 800,
		height: 600,
		show: !headless,
		icon: path.join(process.env.APP_ROOT!, "resources", "icon.png"),
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	if (!headless) {
		win.maximize();
		win.show();
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"));
	}
}

function startDaemon() {
	if (daemonProcess) return;
	if (!fs.existsSync(cliPath)) {
		console.error("[daemon] CLI binary not found at", cliPath, "— skipping daemon start");
		return;
	}
	console.error('[daemon] Starting daemon process...');
	const proc = spawn(cliPath, ["daemon"]);
	daemonProcess = proc;
	proc.stdin?.on("error", () => {
		// swallow EPIPE — expected when daemon exits while a write is in flight
	});
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
		console.error(`[daemon-error] ${data.toString().trim()}`);
	});
	proc.on("close", (code) => {
		const wasActive = daemonProcess === proc;
		console.error(`[daemon] Exited with code ${code ?? 'null'}`);
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
		console.log('[daemon-cmd]->', json);
		daemonProcess.stdin?.write(json + "\n");
	});
}

ipcMain.handle("cli:run", async (_, args: string[]) => {
	const [cmd, ...rest] = args;
	if (cmd === "disconnect") { await stopDaemon(); return ""; }
	return await sendCmd(cmd, rest);
});

function sendSeq(ops: string[][]): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!daemonProcess) { reject(new Error("Daemon not running")); return; }
		const id = ++cmdId;
		const timeout = setTimeout(() => {
			pendingCmds.delete(id);
			reject(new Error("CLI timeout: seq"));
		}, 30_000);
		pendingCmds.set(id, { resolve, reject, timeout });
		const json = JSON.stringify({ id, cmd: "seq", args: ops });
		console.log('[daemon-cmd]->', json);
		daemonProcess.stdin?.write(json + "\n");
	});
}

ipcMain.handle("cli:run-batch", async (_, argsList: string[][]) => {
	if (argsList.length === 0) return [];
	if (argsList.length === 1) {
		const [cmd, ...rest] = argsList[0];
		return [await sendCmd(cmd, rest)];
	}
	return [await sendSeq(argsList)];
});

ipcMain.handle("cli:watch-start", async () => { await stopDaemon(); startDaemon(); });
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
		const lower = filepath.toLowerCase();
		if (!lower.endsWith('.pch2') && !lower.endsWith('.prf2'))
			return { success: false, error: 'Invalid file type' };
		const buf = fs.readFileSync(filepath);
		return { success: true, data: Array.from(buf) };
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("patches:builtin-path", (_, name: string) => {
	const patchesDir = app.isPackaged
		? path.join(process.resourcesPath, "patches")
		: path.join(process.env.APP_ROOT!, "resources", "patches");
	return path.join(patchesDir, name);
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

ipcMain.handle("patch:save-dialog", async (event, defaultName?: string, folder?: string) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const filename = defaultName ? `${defaultName}.pch2` : "patch.pch2";
	const result = await dialog.showSaveDialog(browserWin!, {
		filters: [{ name: "Patch Files", extensions: ["pch2"] }],
		defaultPath: folder ? path.join(folder, filename) : filename,
	});
	if (result.canceled || !result.filePath) return { success: false };
	return { success: true, filepath: result.filePath };
});

ipcMain.handle("perf:save-dialog", async (event, defaultName?: string, folder?: string) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const filename = defaultName ? `${defaultName}.prf2` : "performance.prf2";
	const result = await dialog.showSaveDialog(browserWin!, {
		filters: [{ name: "Performance Files", extensions: ["prf2"] }],
		defaultPath: folder ? path.join(folder, filename) : filename,
	});
	if (result.canceled || !result.filePath) return { success: false };
	return { success: true, filepath: result.filePath };
});

ipcMain.handle("help:load", (_, shortName: string) => {
	const helpDir = app.isPackaged
		? path.join(process.resourcesPath, "doc", "help")
		: path.join(process.env.APP_ROOT!, "..", "doc", "help");
	const filePath = path.join(helpDir, `${shortName}.md`);
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
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

ipcMain.handle("app:info", () => ({
	version: app.getVersion(),
	platform: platformLabel,
	iconDataUrl: `data:image/png;base64,${fs.readFileSync(path.join(process.env.APP_ROOT!, "resources", "icon.png")).toString("base64")}`,
}));

ipcMain.on("shell:openExternal", (_, url: string) => { shell.openExternal(url); });

ipcMain.handle("theme:set", (_, mode: "system" | "light" | "dark") => {
	nativeTheme.themeSource = mode;
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
	console.log(`[startup] G2 Editor v${app.getVersion()} — ${platformLabel}`);

	if (isMac) {
		app.dock.setIcon(path.join(process.env.APP_ROOT!, "resources", "icon.png"));
	}

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
				{ label: "About G2 Editor...", click: () => win!.webContents.send("menu:action", "show-about") },
				{ label: "Preferences...", click: () => win!.webContents.send("menu:action", "toggle-settings"), accelerator: "CommandOrControl+," },
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
				{ label: "Open Performance", click: () => win!.webContents.send("menu:action", "open-performance") },
				{ type: "separator" as const },
				{ label: "Save", click: () => win!.webContents.send("menu:action", "save"), accelerator: "CommandOrControl+S" },
				{ label: "Save As", click: () => win!.webContents.send("menu:action", "save-as"), accelerator: "Shift+CommandOrControl+S" },
				{ label: "Save All", click: () => win!.webContents.send("menu:action", "save-all") },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ label: "Undo", click: () => win!.webContents.send("menu:action", "undo"), accelerator: "CommandOrControl+Z" },
				{ label: "Redo", click: () => win!.webContents.send("menu:action", "redo"), accelerator: "Shift+CommandOrControl+Z" },
				{ type: "separator" as const },
				{ label: "Cut", click: () => win!.webContents.send("menu:action", "cut"), accelerator: "CommandOrControl+X" },
				{ label: "Copy", click: () => win!.webContents.send("menu:action", "copy"), accelerator: "CommandOrControl+C" },
				{ label: "Paste", click: () => win!.webContents.send("menu:action", "paste"), accelerator: "CommandOrControl+V" },
				{ type: "separator" as const },
				{ label: "Delete", click: () => win!.webContents.send("menu:action", "delete"), accelerator: "Backspace" },
				{ label: "Select All", click: () => win!.webContents.send("menu:action", "select-all"), accelerator: "CommandOrControl+A" },
			],
		},
		{
			label: "View",
			submenu: [
				{ label: "Modules", click: () => win!.webContents.send("menu:action", "toggle-modules"), accelerator: "CommandOrControl+M" },
				{ label: "Browser", click: () => win!.webContents.send("menu:action", "toggle-browser"), accelerator: "CommandOrControl+B" },
				{ label: "Midi CC Panel", click: () => win!.webContents.send("menu:action", "toggle-midi-cc-panel"), accelerator: "CommandOrControl+I" },
				{ label: "Settings", click: () => win!.webContents.send("menu:action", "toggle-settings"), accelerator: "CommandOrControl+," },
				{ type: "separator" as const },
				{ label: "Voice Area", click: () => win!.webContents.send("menu:action", "area-voice"), accelerator: "V" },
				{ label: "FX Area", click: () => win!.webContents.send("menu:action", "area-fx"), accelerator: "F" },
				{ type: "separator" as const },
				{ label: "Slot A", click: () => win!.webContents.send("menu:action", "slot-A"), accelerator: "A" },
				{ label: "Slot B", click: () => win!.webContents.send("menu:action", "slot-B"), accelerator: "B" },
				{ label: "Slot C", click: () => win!.webContents.send("menu:action", "slot-C"), accelerator: "C" },
				{ label: "Slot D", click: () => win!.webContents.send("menu:action", "slot-D"), accelerator: "D" },
				{ type: "separator" as const },
				{ label: "Variation 1", click: () => win!.webContents.send("menu:action", "variation-1"), accelerator: "1" },
				{ label: "Variation 2", click: () => win!.webContents.send("menu:action", "variation-2"), accelerator: "2" },
				{ label: "Variation 3", click: () => win!.webContents.send("menu:action", "variation-3"), accelerator: "3" },
				{ label: "Variation 4", click: () => win!.webContents.send("menu:action", "variation-4"), accelerator: "4" },
				{ label: "Variation 5", click: () => win!.webContents.send("menu:action", "variation-5"), accelerator: "5" },
				{ label: "Variation 6", click: () => win!.webContents.send("menu:action", "variation-6"), accelerator: "6" },
				{ label: "Variation 7", click: () => win!.webContents.send("menu:action", "variation-7"), accelerator: "7" },
				{ label: "Variation 8", click: () => win!.webContents.send("menu:action", "variation-8"), accelerator: "8" },
				{ type: "separator" as const },
				{ label: "Toggle DevTools", role: "toggleDevTools" as const, accelerator: "CommandOrControl+Option+I" },
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
				{ label: "Module Help", accelerator: "F1", click: () => win!.webContents.send("menu:action", "show-module-help") },
				{ label: "Key Commands", click: () => win!.webContents.send("menu:action", "show-key-commands") },
				{ type: "separator" as const },
				{ label: "About G2 Editor...", click: () => win!.webContents.send("menu:action", "show-about") },
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});
