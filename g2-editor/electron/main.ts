import { BrowserWindow, app, ipcMain } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

import { fileURLToPath } from "node:url";
import path from "node:path";
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
	proc.on("close", () => {
		// Only clear if this is still the current watch process (not a new one)
		if (watchProcess === proc) watchProcess = null;
		win?.webContents.send("cli:watch-done");
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

ipcMain.on("cli:watch-start", () => startWatch());
ipcMain.on("cli:watch-stop", () => { stopWatchAndWait(); });

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
});
