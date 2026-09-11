import { BrowserWindow, app, ipcMain, dialog, Menu, shell, nativeTheme } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

if (process.env.TEST_USER_DATA) {
	app.setPath('userData', process.env.TEST_USER_DATA);
}

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn, type ChildProcess } from "child_process";
import { loadWindowState, trackWindowState } from "./windowState";
import type { MenuState } from "../src/types/index";

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
	const state = loadWindowState();
	win = new BrowserWindow({
		width: state?.width ?? 800,
		height: state?.height ?? 600,
		x: state?.x,
		y: state?.y,
		show: !headless,
		icon: path.join(process.env.APP_ROOT!, "resources", "icon.png"),
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	if (!headless) {
		if (state?.isMaximized ?? true) win.maximize();
		win.show();
	}

	trackWindowState(win);

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
	console.warn('[daemon] Starting daemon process...');
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

function builtinPatchesDir(): string {
	return app.isPackaged
		? path.join(process.resourcesPath, "patches")
		: path.join(process.env.APP_ROOT!, "resources", "patches");
}

ipcMain.handle("patches:builtin-path", (_, name: string) => {
	return path.join(builtinPatchesDir(), name);
});

// Resolves the path to load for "Init N": a user-saved snapshot in userData if one
// exists, else the bundled EmptyPatch.pch2 (same fallback "New Patch" always uses).
ipcMain.handle("patches:init-load-path", (_, slot: number) => {
	const initPath = path.join(app.getPath("userData"), "patches", `init-${slot}.pch2`);
	if (fs.existsSync(initPath)) return initPath;
	return path.join(builtinPatchesDir(), "EmptyPatch.pch2");
});

// Resolves the write target for "Save Init Patch N", ensuring its directory exists.
ipcMain.handle("patches:init-save-path", (_, slot: number) => {
	const dir = path.join(app.getPath("userData"), "patches");
	fs.mkdirSync(dir, { recursive: true });
	return path.join(dir, `init-${slot}.pch2`);
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

// Writes a patch to a fresh temp dir for a silent (no-dialog) upload-patch push. g2_upload_patch
// derives the on-device patch name from this file's basename (up to the first '.', truncated to
// 15 chars) — sanitize so the temp path's basename matches the patch's actual name.
ipcMain.handle("patch:write-temp", async (_, name: string, data: number[]) => {
	const safe =
		(name || "patch")
			.replace(/[\\/:*?"<>|]/g, "_")
			.replace(/\./g, "_")
			.trim()
			.slice(0, 15) || "patch";
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g2-notes-"));
	const filepath = path.join(dir, `${safe}.pch2`);
	fs.writeFileSync(filepath, Buffer.from(data));
	return filepath;
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

ipcMain.handle("bank:select-folder", async (event) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(browserWin!, {
		properties: ["openDirectory"],
	});
	if (result.canceled || !result.filePaths[0]) return { success: false };
	return { success: true, folder: result.filePaths[0] };
});

ipcMain.handle("bank:select-pchlist", async (event) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(browserWin!, {
		filters: [{ name: "Patch List Files", extensions: ["pchList"] }],
		properties: ["openFile"],
	});
	if (result.canceled || !result.filePaths[0]) return { success: false };
	return { success: true, filepath: result.filePaths[0] };
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

let cachedGraphicsFontFace: string | null | undefined;

function loadGraphicsFontFace(): string | null {
	if (cachedGraphicsFontFace !== undefined) return cachedGraphicsFontFace;
	try {
		const fontPath = path.join(process.env.APP_ROOT!, "public", "fonts", "SairaCondensed-Bold.ttf");
		const b64 = fs.readFileSync(fontPath).toString("base64");
		cachedGraphicsFontFace = `@font-face{font-family:'Saira Condensed';font-weight:700;font-style:normal;src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
	} catch (e) {
		console.warn("Failed to load Saira Condensed font; module graphics will fall back to system fonts:", e);
		cachedGraphicsFontFace = null;
	}
	return cachedGraphicsFontFace;
}

function injectGraphicsFont(svg: string, fontFace: string): string {
	const swapped = svg
		.replace(/font-family:Bahnschrift/g, "font-family:'Saira Condensed'")
		.replace(/font-family:["']Bahnschrift["']/g, "font-family:'Saira Condensed'");
	const defs = `<defs><style>${fontFace}</style></defs>`;
	return swapped.replace(/(<svg\b[^>]*>)/, `$1${defs}`);
}

ipcMain.handle("modules:load-graphics", () => {
	const graphicsDir = app.isPackaged
		? path.join(process.resourcesPath, "designs", "mini-modules")
		: path.join(process.env.APP_ROOT!, "..", "designs", "mini-modules");
	const fontFace = loadGraphicsFontFace();
	const graphics: Record<number, string> = {};
	try {
		for (const category of fs.readdirSync(graphicsDir)) {
			const categoryDir = path.join(graphicsDir, category);
			if (!fs.statSync(categoryDir).isDirectory()) continue;
			for (const file of fs.readdirSync(categoryDir)) {
				if (!file.endsWith(".svg")) continue;
				const idToken = file.split("_")[0];
				const id = idToken.toLowerCase().startsWith("0x") ? parseInt(idToken, 16) : parseInt(idToken, 10);
				if (Number.isNaN(id)) continue;
				let svg = fs.readFileSync(path.join(categoryDir, file), "utf-8");
				if (fontFace) svg = injectGraphicsFont(svg, fontFace);
				graphics[id] = `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
			}
		}
	} catch {
		// designs folder missing — return whatever was collected (likely empty)
	}
	return graphics;
});

ipcMain.handle("patch:open-dialog", async (event, kind?: "patch" | "performance") => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const filters =
		kind === "patch"
			? [{ name: "Patch Files", extensions: ["pch2"] }]
			: kind === "performance"
				? [{ name: "Performance Files", extensions: ["prf2"] }]
				: [{ name: "Patch Files", extensions: ["pch2", "prf2"] }];
	const result = await dialog.showOpenDialog(browserWin!, {
		filters,
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

const SLOT_LABELS = ["A", "B", "C", "D"] as const;
type RecentFileEntry = { path: string; kind: "patch" | "performance" };
const defaultMenuState: MenuState = {
	connected: false,
	canUndo: false,
	canRedo: false,
	hasSelection: false,
	hasClipboard: false,
	hasCurrentPatch: false,
	hasPerformanceContext: false,
};

function buildMenu(recentFiles: RecentFileEntry[], menuState: MenuState): Electron.MenuItemConstructorOptions[] {
	const slotSubmenu = (actionPrefix: string): Electron.MenuItemConstructorOptions[] =>
		SLOT_LABELS.map((s) => ({ label: `Slot ${s}`, click: () => win!.webContents.send("menu:action", `${actionPrefix}-${s}`) }));

	return [
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
				{ label: "New To", submenu: slotSubmenu("new-to") },
				{ type: "separator" as const },
				{ label: "Open", click: () => win!.webContents.send("menu:action", "open"), accelerator: "CommandOrControl+O" },
				{ label: "Open Performance", click: () => win!.webContents.send("menu:action", "open-performance") },
				{ label: "Open To", submenu: slotSubmenu("open-to") },
				{
					label: "Recent Files",
					submenu: recentFiles.length
						? recentFiles.map((f, i) => ({ label: path.basename(f.path), click: () => win!.webContents.send("menu:action", `open-recent:${i}`) }))
						: [{ label: "(Empty)", enabled: false }],
				},
				{ type: "separator" as const },
				{ label: "Save", click: () => win!.webContents.send("menu:action", "save"), accelerator: "CommandOrControl+S" },
				{ label: "Save As", click: () => win!.webContents.send("menu:action", "save-as"), accelerator: "Shift+CommandOrControl+S" },
				{ label: "Save All", click: () => win!.webContents.send("menu:action", "save-all") },
				{ label: "Save From", submenu: slotSubmenu("save-from") },
				{ type: "separator" as const },
				{ label: "Save Init Patch 1", click: () => win!.webContents.send("menu:action", "save-init-1") },
				{ label: "Save Init Patch 2", click: () => win!.webContents.send("menu:action", "save-init-2") },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ label: "Undo", click: () => win!.webContents.send("menu:action", "undo"), accelerator: "CommandOrControl+Z", enabled: menuState.canUndo },
				{
					label: "Redo",
					click: () => win!.webContents.send("menu:action", "redo"),
					accelerator: "Shift+CommandOrControl+Z",
					enabled: menuState.canRedo,
				},
				{ type: "separator" as const },
				{ label: "Cut", click: () => win!.webContents.send("menu:action", "cut"), accelerator: "CommandOrControl+X", enabled: menuState.hasSelection },
				{
					label: "Copy",
					click: () => win!.webContents.send("menu:action", "copy"),
					accelerator: "CommandOrControl+C",
					enabled: menuState.hasSelection,
				},
				{
					label: "Paste",
					click: () => win!.webContents.send("menu:action", "paste"),
					accelerator: "CommandOrControl+V",
					enabled: menuState.hasClipboard,
				},
				{
					label: "Clear",
					click: () => win!.webContents.send("menu:action", "delete"),
					accelerator: "Backspace",
					enabled: menuState.hasSelection,
				},
				{
					label: "Paste Params",
					click: () => win!.webContents.send("menu:action", "paste-params"),
					accelerator: "CommandOrControl+E",
					enabled: menuState.hasClipboard,
				},
				{ label: "Select All", click: () => win!.webContents.send("menu:action", "select-all"), accelerator: "CommandOrControl+A" },
				{ type: "separator" as const },
			],
		},
		{
			label: "View",
			submenu: [
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
				{ label: "Zoom In", click: () => win!.webContents.send("menu:action", "zoom-in"), accelerator: "CommandOrControl+=" },
				{ label: "Zoom Out", click: () => win!.webContents.send("menu:action", "zoom-out"), accelerator: "CommandOrControl+-" },
				{ label: "Actual Size", click: () => win!.webContents.send("menu:action", "zoom-reset"), accelerator: "CommandOrControl+0" },
			],
		},
		{
			label: "Patch",
			submenu: [
				{
					label: "Patch Settings",
					click: () => win!.webContents.send("menu:action", "open-patch-settings"),
					accelerator: "CommandOrControl+P",
					enabled: menuState.hasCurrentPatch,
				},
				{ label: "Text Panel", click: () => win!.webContents.send("menu:action", "toggle-text-panel"), accelerator: "CommandOrControl+J" },
				{ label: "Delete Unused Modules", click: () => win!.webContents.send("menu:action", "delete-unused-modules") },
				{
					label: "Download to Slot",
					click: () => win!.webContents.send("menu:action", "download-to-slot"),
					accelerator: "CommandOrControl+D",
					enabled: menuState.connected && menuState.hasCurrentPatch,
				},
			],
		},
		{
			label: "Performance",
			submenu: [
				{
					label: "Performance Settings",
					click: () => win!.webContents.send("menu:action", "open-performance-settings"),
					accelerator: "CommandOrControl+R",
					enabled: menuState.hasPerformanceContext,
				},
				{ label: "Download", click: () => win!.webContents.send("menu:action", "download-performance"), enabled: menuState.connected && menuState.hasPerformanceContext },
				{ label: "Bank Upload (from G2)", click: () => win!.webContents.send("menu:action", "bank-upload"), enabled: menuState.connected },
				{ label: "Bank Download (to G2)", click: () => win!.webContents.send("menu:action", "bank-download"), enabled: menuState.connected },
				{
					label: "Send Controller Snapshot",
					click: () => win!.webContents.send("menu:action", "send-controller-snapshot"),
					accelerator: "CommandOrControl+M",
					enabled: menuState.connected,
				},
				{
					label: "Dump One",
					click: () => win!.webContents.send("menu:action", "dump-one"),
					accelerator: "CommandOrControl+1",
					enabled: menuState.connected,
				},
			],
		},
		{
			label: "Synth",
			submenu: [
				{
					label: "Synth Settings",
					click: () => win!.webContents.send("menu:action", "open-synth-settings"),
					accelerator: "CommandOrControl+G",
					enabled: menuState.connected,
				},
				{
					label: "Upload Active Slot",
					click: () => win!.webContents.send("menu:action", "upload-active-slot"),
					accelerator: "CommandOrControl+U",
					enabled: menuState.connected,
				},
				{
					label: "Save in Synth",
					click: () => win!.webContents.send("menu:action", "store-in-synth"),
					enabled: menuState.connected && menuState.hasCurrentPatch,
				},
			],
		},
		{
			label: "Setup",
			submenu: [
				{ label: "Editor Options", click: () => win!.webContents.send("menu:action", "toggle-settings"), accelerator: "CommandOrControl+," },
			],
		},
		{
			label: "Tools",
			submenu: [
				{ label: "Parameter Pages", click: () => win!.webContents.send("menu:action", "toggle-parameter-pages"), accelerator: "CommandOrControl+F" },
				{ label: "Keyboard", click: () => win!.webContents.send("menu:action", "toggle-keyboard"), accelerator: "CommandOrControl+K" },
				{ type: "separator" as const },
				{ label: "Modules", click: () => win!.webContents.send("menu:action", "toggle-modules"), accelerator: "CommandOrControl+M" },
				{ label: "Browser", click: () => win!.webContents.send("menu:action", "toggle-browser"), accelerator: "CommandOrControl+B" },
				{ label: "Midi CC Panel", click: () => win!.webContents.send("menu:action", "toggle-midi-cc-panel"), accelerator: "CommandOrControl+I" },
				{ type: "separator" as const },
				{ label: "Extended Toolbar", click: () => win!.webContents.send("menu:action", "toggle-extended-toolbar"), accelerator: "CommandOrControl+T" },
			],
		},
		{
			label: "Help",
			submenu: [
				{ label: "Module Help", accelerator: "F1", click: () => win!.webContents.send("menu:action", "show-module-help") },
				{ label: "Key Commands", click: () => win!.webContents.send("menu:action", "show-key-commands") },
				{ type: "separator" as const },
				{ label: "Toggle DevTools", role: "toggleDevTools" as const, accelerator: "CommandOrControl+Option+I" },
				// { label: "ShowSVG", click: () => win!.webContents.send("menu:action", "toggle-svg-viewer") },
				{ type: "separator" as const },
				{ label: "About G2 Editor...", click: () => win!.webContents.send("menu:action", "show-about") },
			],
		},
	];
}

let lastRecentFiles: RecentFileEntry[] = [];
let lastMenuState: MenuState = defaultMenuState;

function refreshMenu(): void {
	Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu(lastRecentFiles, lastMenuState)));
}

ipcMain.on("recent-files:update", (_, files: RecentFileEntry[]) => {
	lastRecentFiles = files;
	refreshMenu();
});

ipcMain.on("menu-state:update", (_, state: MenuState) => {
	lastMenuState = state;
	refreshMenu();
});

let quitting = false;
app.on("before-quit", (e) => {
	if (quitting) return;
	e.preventDefault();
	quitting = true;
	(async () => {
		// await stopWatchAndWait();
		// try { await runCliRaw(["disconnect"]); } catch { /* already disconnected */ }
		await stopDaemon();
		app.quit();
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

	refreshMenu();
});
