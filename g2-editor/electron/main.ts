import { BrowserWindow, app, ipcMain, dialog, Menu } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..", "..");

export const VITE_DEV_SERVER_URL =
	process.env["VITE_DEV_SERVER_URL"] || "http://localhost:5173";
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;
let watchProcess: ChildProcess | null = null;

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

function startWatch() {
	if (watchProcess) return;
	const proc = spawn(cliPath, ["watch"]);
	watchProcess = proc;
	let buffer = "";
	proc.stdout?.on("data", (data: Buffer) => {
		buffer += data.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed) win?.webContents.send("cli:watch-event", trimmed);
		}
	});
	proc.on("close", (code) => {
		const wasActive = watchProcess === proc;
		if (wasActive) watchProcess = null;
		if (!wasActive) return; // killed intentionally by stopWatchAndWait
		if (code !== null && code !== 0) {
			win?.webContents.send("cli:device-disconnected");
		} else {
			win?.webContents.send("cli:watch-done");
		}
	});
}

async function stopWatchAndWait(): Promise<void> {
	if (!watchProcess) return;
	const proc = watchProcess;
	watchProcess = null;
	return new Promise<void>((resolve) => {
		proc.on("close", () => resolve());
		proc.kill("SIGTERM");
	});
}

async function runCliRaw(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		console.log(`[cli] spawn: ${args.join(" ")}`);
		const child = spawn(cliPath, args);
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr?.on("data", (data) => {
			const text = data.toString();
			stderr += text;
			console.log(`[cli:${args[0]}] stderr: ${text.trim()}`);
		});

		child.on("close", (code, signal) => {
			console.log(`[cli:${args[0]}] exit code=${code} signal=${signal}`);
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(stderr || `Exit code: ${code}, signal: ${signal}`));
			}
		});

		child.on("error", (err) => {
			console.log(`[cli:${args[0]}] error: ${err.message}`);
			reject(err);
		});
	});
}

async function runCli(args: string[]): Promise<string> {
	const wasWatching = !!watchProcess;
	if (wasWatching) await stopWatchAndWait();
	try {
		return await runCliRaw(args);
	} finally {
		if (wasWatching) startWatch();
	}
}

ipcMain.handle("cli:run", async (_, args: string[]) => {
	try {
		return await runCli(args);
	} catch (err: any) {
		throw new Error(err.message);
	}
});

ipcMain.handle("cli:run-batch", async (_, argsList: string[][]) => {
	const wasWatching = !!watchProcess;
	if (wasWatching) await stopWatchAndWait();
	try {
		const results: string[] = [];
		for (const args of argsList) {
			results.push(await runCliRaw(args));
		}
		return results;
	} finally {
		if (wasWatching) startWatch();
	}
});

ipcMain.on("cli:watch-start", () => startWatch());
ipcMain.on("cli:watch-stop", () => { stopWatchAndWait(); });

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

ipcMain.handle("patch:save-dialog", async (event) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showSaveDialog(browserWin!, {
		filters: [{ name: "Patch Files", extensions: ["pch2"] }],
		defaultPath: "patch.pch2",
	});
	if (result.canceled || !result.filePath) return { success: false };
	return { success: true, filepath: result.filePath };
});

app.on("before-quit", (e) => {
	e.preventDefault();
	(async () => {
		await stopWatchAndWait();
		try { await runCliRaw(["disconnect"]); } catch { /* already disconnected */ }
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
		{
			label: "G2 Editor",
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "File",
			submenu: [
				{ label: "New Patch", click: () => win!.webContents.send("menu:action", "new-patch") },
				{ label: "New Performance", click: () => win!.webContents.send("menu:action", "new-performance") },
				{ type: "separator" },
				{ label: "Open", click: () => win!.webContents.send("menu:action", "open"), accelerator: "CommandOrControl+O" },
				{ type: "separator" },
				{ label: "Save", click: () => win!.webContents.send("menu:action", "save"), accelerator: "CommandOrControl+S" },
				{ label: "Save As", click: () => win!.webContents.send("menu:action", "save-as") },
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
				{ label: "Browser", click: () => win!.webContents.send("menu:action", "slot-A"), accelerator: "CommandOrControl+B" },
				{ label: "USB", click: () => win!.webContents.send("menu:action", "slot-A"), accelerator: "CommandOrControl+U" },
				{ type: "separator" },
				{ label: "Voice Area", click: () => win!.webContents.send("menu:action", "area-voice"), accelerator: "CommandOrControl+V" },
				{ label: "FX Area", click: () => win!.webContents.send("menu:action", "area-fx"), accelerator: "CommandOrControl+F" },
				{ type: "separator" },
				{ label: "Slot A", click: () => win!.webContents.send("menu:action", "slot-A"), accelerator: "A" },
				{ label: "Slot B", click: () => win!.webContents.send("menu:action", "slot-B"), accelerator: "B" },
				{ label: "Slot C", click: () => win!.webContents.send("menu:action", "slot-C"), accelerator: "C" },
				{ label: "Slot D", click: () => win!.webContents.send("menu:action", "slot-D"), accelerator: "D" },
			],
		},
		{
			label: "Help",
			submenu: [
				{ role: "about" },
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});
