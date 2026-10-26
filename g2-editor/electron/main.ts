import { BrowserWindow, app, ipcMain, dialog, Menu, shell, nativeTheme, clipboard } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

if (process.env.TEST_USER_DATA) {
	app.setPath('userData', process.env.TEST_USER_DATA);
}

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "child_process";
import { loadWindowState, trackWindowState } from "./windowState";
import type { MenuState } from "../src/types/index";
import type { DeviceStatus } from "../src/store/device";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..", "..");

export const VITE_DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

/* One BrowserWindow + one daemon subprocess per connected G2, so switching
 * devices is just OS window focus — nothing reloads, both stay live. A window
 * usually gets its DeviceSession once its renderer calls devices:connect, except
 * a device discovered via "Add Device" (see discoverDevices) which is pre-registered
 * with a hidden window right away, so it starts connecting in the background. */
interface DeviceSession {
	id: string;
	bus: number;
	device: number;
	name: string | null;
	status: DeviceStatus;
	window: BrowserWindow;
	daemonProcess: ChildProcess | null;
	cmdId: number;
	pendingCmds: Map<number, { resolve: (v: string) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>;
	menuState: MenuState;
	// Set while the daemon was started before its renderer attached (see the startup loop in
	// app.whenReady): watch events are held here and flushed by cli:watch-start.
	earlyEvents?: string[] | null;
}
const MAX_EARLY_EVENTS = 10_000;
const sessions = new Map<string, DeviceSession>();
const sessionByWebContentsId = new Map<number, DeviceSession>();
// The focused window, not its session id: a session's id changes (G2 re-enumerated at a new address,
// daemon restart re-claim), which left the menu showing the not-connected default until a refocus.
let activeWebContentsId: number | null = null;
const activeSession = (): DeviceSession | undefined =>
	activeWebContentsId === null ? undefined : sessionByWebContentsId.get(activeWebContentsId);

// Pre-assigns a startup window to a specific physical device (set right after the
// window is created, before its renderer loads) so parallel startup windows each
// bind to a distinct device instead of racing on devices:list's "first unclaimed".
// showSplash is decided here too, synchronously, in creation order — deterministic,
// unlike leaving it to whichever renderer's onMounted happens to run first (a real
// race between independent renderer processes, which one lost was effectively random).
const pendingAssignment = new Map<number, { bus: number; device: number; showSplash: boolean }>();

// Shows the About/credits splash only for the first window of an app launch; every
// other window just shows its own connecting spinner instead — see devices:get-assignment
// / claim-startup-splash. Used directly by parallel-launch windows' showSplash above; kept
// as a fallback IPC for the single-window (no devices found) case, which has no assignment.
let startupSplashClaimed = false;

const isMac = process.platform === 'darwin';
const platformNames: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
const platformLabel = `${platformNames[process.platform] ?? process.platform} ${process.getSystemVersion()}`;
const DONATE_URL = "https://www.paypal.com/donate/?hosted_button_id=UZE943PYKY5S6";

const cliName = process.platform === "win32" ? "g2-cli.exe" : "g2-cli";
const cliPath = app.isPackaged
	? path.join(process.resourcesPath, cliName)
	: path.join(process.env.APP_ROOT!, "resources", cliName);

function safeSend(window: BrowserWindow, channel: string, ...args: unknown[]): void {
	if (!window.isDestroyed()) window.webContents.send(channel, ...args);
}

function sendToFocused(channel: string, ...args: unknown[]): void {
	const focused = BrowserWindow.getFocusedWindow();
	if (focused && !focused.isDestroyed()) focused.webContents.send(channel, ...args);
}

// Files handed to us by the OS (open-file / argv). Held until a renderer has registered its
// listener (app:open-file-ready), since on a cold start they arrive before any window exists.
const pendingOpenFiles: string[] = [];
const openFileReadyIds = new Set<number>();

function openFileInApp(filepath: string): void {
	if (!/\.(pch2|prf2)$/i.test(filepath)) return;
	const ready = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && openFileReadyIds.has(w.webContents.id));
	const target = ready.find((w) => w.isFocused()) ?? ready[0];
	if (!target) {
		pendingOpenFiles.push(filepath);
		return;
	}
	revealWindow(target);
	target.webContents.send("file:open", filepath);
}

ipcMain.handle("app:open-file-ready", (event) => {
	openFileReadyIds.add(event.sender.id);
	for (const filepath of pendingOpenFiles.splice(0)) openFileInApp(filepath);
});

app.on("open-file", (event, filepath) => {
	event.preventDefault();
	openFileInApp(filepath);
});

// Windows/Linux pass the file as an argument; a second launch is forwarded to the running instance.
// Packaged builds only, so parallel dev/e2e instances (which share no userData) aren't blocked.
const gotInstanceLock = !app.isPackaged || app.requestSingleInstanceLock();
if (!gotInstanceLock) app.quit();
app.on("second-instance", (_event, argv, workingDirectory) =>
	argv.slice(1).forEach((arg) => openFileInApp(path.resolve(workingDirectory, arg))));
if (!isMac) pendingOpenFiles.push(...process.argv.slice(1).filter((arg) => /\.(pch2|prf2)$/i.test(arg)));

function resolveSession(event: { sender: { id: number } }): DeviceSession | undefined {
	return sessionByWebContentsId.get(event.sender.id);
}

// Frees a session's claim on its bus:device id (sessions, the map that gates rediscovery
// and the Window/DeviceSwitcher lists) without touching sessionByWebContentsId — that map's
// lifetime is tied to the window, not the daemon, so a window can keep routing IPC to a
// session whose daemon just died (see startDaemon's retry-in-place re-claim below).
function unregisterSession(session: DeviceSession): void {
	if (sessions.get(session.id) === session) sessions.delete(session.id);
}

function broadcastDevicesChanged(): void {
	const list = Array.from(sessions.values()).map((s) => ({
		id: s.id,
		bus: s.bus,
		device: s.device,
		name: s.name,
		hasDaemon: s.daemonProcess !== null,
		status: s.status,
	}));
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) window.webContents.send("devices:changed", list);
	}
	refreshMenu();
}

// Shows (maximizing first, matching a freshly-created window's usual state) and focuses a
// window that may still be hidden — used when a background-connected device (see
// discoverDevices) is picked from DeviceSwitcher/Window menu. A no-op beyond focus() if
// the window is already visible, so it never re-maximizes a window the user resized.
function revealWindow(window: BrowserWindow): void {
	if (!window.isVisible()) {
		if (process.env.HEADLESS !== '1') window.maximize();
		window.show();
	}
	window.focus();
}

function createAppWindow(cascadeIndex = 0, visible = true): BrowserWindow {
	const headless = process.env.HEADLESS === '1';
	const state = loadWindowState();
	// All windows share one saved position (window-state.json has no per-window slot), so
	// opening several at once would otherwise stack them exactly on top of each other —
	// cascade non-maximized ones so they're visually distinguishable and cycling is legible.
	const cascade = cascadeIndex * 32;
	const window = new BrowserWindow({
		width: state?.width ?? 800,
		height: state?.height ?? 600,
		x: state?.x !== undefined ? state.x + cascade : undefined,
		y: state?.y !== undefined ? state.y + cascade : undefined,
		show: visible && !headless,
		icon: path.join(process.env.APP_ROOT!, "resources", "icon.png"),
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// visible=false (see discoverDevices) leaves the window hidden and unmaximized —
	// it's revealed later via revealWindow, which maximizes at that point instead.
	if (!headless && visible) {
		if (state?.isMaximized ?? true) window.maximize();
		window.show();
	}

	trackWindowState(window, cascade);
	if (!isMac) applyWindowMenu(window);

	if (VITE_DEV_SERVER_URL) {
		window.loadURL(VITE_DEV_SERVER_URL);
	} else {
		window.loadFile(path.join(RENDERER_DIST, "index.html"));
	}

	// Session (if any) is bound later via devices:connect; look it up by id at
	// close time rather than capturing it now, since binding is asynchronous.
	const wcId = window.webContents.id;
	// Diagnostics: a duration run (2026-10-09) lost its only window with nothing in the log.
	window.on("close", () => console.log(`[window] close requested (webContents ${wcId})`));
	window.webContents.on("render-process-gone", (_e, details) => console.log(`[window] renderer gone (webContents ${wcId}): ${details.reason} (exit ${details.exitCode})`));
	window.on("closed", () => {
		pendingAssignment.delete(wcId);
		openFileReadyIds.delete(wcId);
		storageDirByWc.delete(wcId);
		pruneStorageWatchers();
		const session = sessionByWebContentsId.get(wcId);
		if (!session) return;
		sessionByWebContentsId.delete(wcId);
		unregisterSession(session);
		void stopDaemon(session);
		broadcastDevicesChanged();
	});

	return window;
}

function startDaemon(session: DeviceSession) {
	if (session.daemonProcess) return;
	if (!fs.existsSync(cliPath)) {
		console.error("[daemon] CLI binary not found at", cliPath, "— skipping daemon start");
		return;
	}
	// Re-claim the id if a prior crash freed it (see unregisterSession) — but never steal
	// it from a different session that claimed it in the meantime; that window just stays
	// local (routes IPC via sessionByWebContentsId only, absent from sessions/DeviceSwitcher).
	const owner = sessions.get(session.id);
	if (!owner) {
		sessions.set(session.id, session);
		broadcastDevicesChanged();
	} else if (owner !== session) {
		console.warn(`[daemon] ${session.id} was claimed by another window while this one was disconnected — continuing locally without rejoining the device list.`);
	}
	console.warn(`[daemon] Starting daemon process for ${session.id}...`);
	const proc = spawn(cliPath, ["daemon", String(session.bus), String(session.device)]);
	session.daemonProcess = proc;
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
			// Truncated: slot_data/names lines are multi-KB and this runs on the main thread.
			console.log(`[daemon-watch:${session.id}]`, line.length > 300 ? `${line.slice(0, 300)}… (${line.length} chars)` : line);
			// Only command responses ({"id":...}) need parsing here; events go to the renderer verbatim.
			let msg: any;
			if (trimmed.startsWith('{"id":')) {
				try {
					msg = JSON.parse(trimmed);
				} catch {
					// forward as an event below
				}
			}
			// The daemon followed the G2 to a new address on the same port (G2 self-reboot): keep the claim map in
			// step, otherwise "Add Device" offers the same G2 again as unclaimed.
			if (trimmed.startsWith('{"type":"device_retargeted"')) {
				try {
					const { bus, device } = JSON.parse(trimmed);
					if (sessions.get(session.id) === session) sessions.delete(session.id);
					rekeySession(session, bus, device);
					if (!sessions.has(session.id)) sessions.set(session.id, session);
					broadcastDevicesChanged();
				} catch {
					// malformed: leave the session as it was
				}
			}
			if (msg?.id !== undefined) {
				const pending = session.pendingCmds.get(msg.id);
				if (pending) {
					clearTimeout(pending.timeout);
					session.pendingCmds.delete(msg.id);
					if (msg.ok) {
						pending.resolve(msg.data ? JSON.stringify(msg.data) : "");
					} else {
						pending.reject(new Error(msg.error ?? `G2 error code: ${msg.code}`));
					}
				}
			} else if (session.earlyEvents) {
				if (session.earlyEvents.length < MAX_EARLY_EVENTS) session.earlyEvents.push(trimmed);
			} else {
				safeSend(session.window, "cli:watch-event", trimmed);
			}
		}
	});
	proc.stderr?.on("data", (data: Buffer) => {
		console.error(`[daemon-error:${session.id}] ${data.toString().trim()}`);
	});
	const onExit = (code: number | null) => {
		const wasActive = session.daemonProcess === proc;
		console.error(`[daemon:${session.id}] Exited with code ${code ?? 'null'}`);
		if (wasActive) session.daemonProcess = null;
		for (const pending of session.pendingCmds.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Daemon exited"));
		}
		session.pendingCmds.clear();
		if (!wasActive) return;
		unregisterSession(session);
		if (code !== null && code !== 0) {
			safeSend(session.window, "cli:device-disconnected");
		} else {
			safeSend(session.window, "cli:watch-done");
		}
		broadcastDevicesChanged();
	};
	// Spawn failure (e.g. EACCES/ENOENT): 'close' may never fire, so report the disconnect here.
	proc.on("error", (err) => {
		console.error(`[daemon:${session.id}] Failed to run:`, err);
		onExit(1);
	});
	proc.on("close", onExit);
}

async function stopDaemon(session: DeviceSession): Promise<void> {
	if (!session.daemonProcess) return;
	const proc = session.daemonProcess;
	session.daemonProcess = null;
	if (proc.exitCode !== null || proc.signalCode !== null) return;
	return new Promise<void>((resolve) => {
		// The daemon finishes its in-flight command before exiting on SIGTERM (reload-names takes ~6 s).
		// SIGKILL mid-command leaves the G2 unresponsive until power-cycled, so only use it as a last
		// resort for a truly stuck daemon; resolve regardless so close/quit never hang.
		const killTimer = setTimeout(() => proc.kill("SIGKILL"), 30000);
		const giveUpTimer = setTimeout(() => done(), 32000);
		const done = () => {
			clearTimeout(killTimer);
			clearTimeout(giveUpTimer);
			resolve();
		};
		proc.on("close", done);
		proc.kill("SIGTERM");
	});
}

/* Spawns g2-cli fresh for a single one-shot command (list-devices, get-device-name)
 * and resolves with its full stdout once it exits — no persistent daemon needed. */
function runCliOneShot(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!fs.existsSync(cliPath)) {
			reject(new Error("CLI binary not found"));
			return;
		}
		const proc = spawn(cliPath, args);
		let stdout = "";
		let stderr = "";
		proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
		proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) resolve(stdout);
			else reject(new Error(stderr.trim() || `g2-cli exited with code ${code}`));
		});
	});
}

/* A bank is 128 locations of flash writes/clears — minutes, not seconds. The
 * generic 30 s timeout rejects the promise while the daemon is still working,
 * so the UI reports failure over a run that is actually succeeding. A single
 * put-location/clear-patch waits up to 20 x 2 s for the G2's flash result
 * (await_flash_result), also past 30 s. */
const LONG_CMDS = new Set(["send-bank", "get-bank", "put-location", "clear-patch"]);

// Commands whose byte-array arg carries a whole patch/performance payload - sent
// base64-encoded instead of a JSON array of decimal numbers, which is ~3-4x larger
// on the wire. Kept to a known command allowlist so small numeric-array args to
// other commands (e.g. RGB tuples) aren't accidentally base64-encoded.
const BASE64_ARG_CMDS = new Set(["upload-patch-data", "upload-perf-data"]);

function sendCmd(session: DeviceSession, cmd: string, args: (string | number[])[]): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!session.daemonProcess) {
			reject(new Error("Daemon not running"));
			return;
		}
		const id = ++session.cmdId;
		const timeout = setTimeout(() => {
			session.pendingCmds.delete(id);
			reject(new Error(`CLI timeout: ${cmd}`));
		}, LONG_CMDS.has(cmd) ? 600_000 : 30_000);
		session.pendingCmds.set(id, { resolve, reject, timeout });
		const wireArgs: (string | number[])[] = BASE64_ARG_CMDS.has(cmd)
			? args.map((a) => (Array.isArray(a) ? Buffer.from(a).toString("base64") : a))
			: args;
		const json = JSON.stringify({ id, cmd, args: wireArgs });
		// Elide inline byte-array payloads (e.g. upload-patch-data) from the log line.
		const logArgs = args.map((a) => (Array.isArray(a) ? `<${a.length} bytes>` : a));
		console.log(`[daemon-cmd:${session.id}]->`, JSON.stringify({ id, cmd, args: logArgs }));
		session.daemonProcess.stdin?.write(json + "\n");
	});
}

// Commands the renderer actually sends (derived from cli.run/runBatch usages in src/).
const ALLOWED_CMDS = new Set([
	"add-cable", "add-module", "assign-global-knob", "assign-knob", "assign-midicc", "assign-midicc-batch",
	"clear-bank", "clear-patch", "copy-variation", "deassign-global-knob", "deassign-knob", "deassign-midicc",
	"deassign-midicc-batch", "del-cable", "del-module", "disconnect", "dump-patch", "get-bank", "get-global-knobs",
	"get-global-page", "get-location", "get-param-page", "get-patch", "get-perf-file-buf", "get-perf-settings", "get-resources",
	"list", "move-module", "play-note", "put-location", "reload-names", "select-global-page", "select-param", "select-param-page",
	"select-patch", "select-perf", "send-bank", "send-controller-snapshot", "set-cable-color", "set-knob-source",
	"set-master-clock-bpm", "set-master-clock-run", "set-module-color", "set-module-labels", "set-module-mode", "set-module-uprate",
	"send-sections", "set-module-name", "set-morph-range", "set-mutation-lock", "set-morph-range-batch", "set-param", "set-patch-description",
	"set-patch-name", "set-perf-mode", "set-perf-name", "set-range-enable", "set-slot-enabled", "set-slot-hold",
	"set-slot-key", "set-slot-range", "set-synth-settings", "slot", "store-patch", "upload-patch",
	"upload-patch-data", "upload-perf", "upload-perf-data", "variation",
]);

function assertAllowedCmd(cmd: unknown): asserts cmd is string {
	if (typeof cmd !== "string" || !ALLOWED_CMDS.has(cmd)) throw new Error(`Command not allowed: ${String(cmd)}`);
}

ipcMain.handle("cli:run", async (event, args: (string | number[])[]) => {
	const [cmd, ...rest] = args as [string, ...(string | number[])[]];
	assertAllowedCmd(cmd);
	const session = resolveSession(event);
	if (cmd === "disconnect") {
		if (session) await stopDaemon(session);
		return "";
	}
	if (!session) throw new Error("Daemon not running");
	return await sendCmd(session, cmd, rest);
});

function sendSeq(session: DeviceSession, ops: string[][]): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!session.daemonProcess) { reject(new Error("Daemon not running")); return; }
		const id = ++session.cmdId;
		const timeout = setTimeout(() => {
			session.pendingCmds.delete(id);
			reject(new Error("CLI timeout: seq"));
		}, 30_000);
		session.pendingCmds.set(id, { resolve, reject, timeout });
		const json = JSON.stringify({ id, cmd: "seq", args: ops });
		console.log(`[daemon-cmd:${session.id}]->`, json);
		session.daemonProcess.stdin?.write(json + "\n");
	});
}

ipcMain.handle("cli:run-batch", async (event, argsList: string[][]) => {
	const session = resolveSession(event);
	if (!session) throw new Error("Daemon not running");
	if (argsList.length === 0) return [];
	argsList.forEach(([cmd]) => assertAllowedCmd(cmd));
	if (argsList.length === 1) {
		const [cmd, ...rest] = argsList[0];
		return [await sendCmd(session, cmd, rest)];
	}
	return [await sendSeq(session, argsList)];
});

ipcMain.handle("cli:watch-start", async (event) => {
	const session = resolveSession(event);
	if (!session) throw new Error("No device bound to this window");
	if (session.earlyEvents && session.daemonProcess) {
		// Daemon was started ahead of the renderer: the listener is registered now, hand over what it missed.
		const held = session.earlyEvents;
		session.earlyEvents = null;
		for (const line of held) safeSend(session.window, "cli:watch-event", line);
		return;
	}
	session.earlyEvents = null;
	await stopDaemon(session);
	startDaemon(session);
});
ipcMain.on("cli:watch-stop", (event) => {
	const session = resolveSession(event);
	if (session) stopDaemon(session);
});

// --- Device discovery / multi-window management ---

async function listAttachedDevices(): Promise<{ bus: number; device: number; id: string; alreadyConnected: boolean }[]> {
	// Set by e2e specs so neither startup nor the renderer ever binds to real attached hardware.
	if (process.env.G2_HIDE_DEVICES === '1') return [];
	const out = await runCliOneShot(["--json", "list-devices"]);
	const parsed = JSON.parse(out);
	const all: any[] = parsed.all ?? [];
	return all
		.filter((d) => d.isG2)
		.map((d) => ({
			bus: d.bus,
			device: d.device,
			id: `${d.bus}:${d.device}`,
			alreadyConnected: sessions.has(`${d.bus}:${d.device}`),
		}));
}

ipcMain.handle("devices:list", async () => listAttachedDevices());

ipcMain.handle("devices:get-assignment", (event) => {
	const assignment = pendingAssignment.get(event.sender.id) ?? null;
	pendingAssignment.delete(event.sender.id);
	return assignment;
});

ipcMain.handle("app:claim-startup-splash", () => {
	const isFirst = !startupSplashClaimed;
	startupSplashClaimed = true;
	return isFirst;
});

function newSession(id: string, bus: number, device: number, window: BrowserWindow): DeviceSession {
	return {
		id,
		bus,
		device,
		name: null,
		status: "connecting" as DeviceStatus,
		window,
		daemonProcess: null,
		cmdId: 0,
		pendingCmds: new Map(),
		menuState: { ...defaultMenuState },
	};
}

// Moves a session to a new bus:device id. Callers drop the old id from `sessions` first when needed.
function rekeySession(session: DeviceSession, bus: number, device: number): void {
	session.id = `${bus}:${device}`;
	session.bus = bus;
	session.device = device;
}

ipcMain.handle("devices:connect", async (event, bus: number, device: number) => {
	const window = BrowserWindow.fromWebContents(event.sender);
	if (!window) throw new Error("No window for this call");
	const id = `${bus}:${device}`;
	let session = sessionByWebContentsId.get(event.sender.id);
	const owner = sessions.get(id);
	if (owner && owner !== session) {
		throw new Error(`Device ${id} is already connected in another window`);
	}
	if (session) {
		if (session.id !== id) {
			// Rebinding this window to a different device — stop any daemon still bound to
			// the old bus/device first, so it never keeps routing commands to it (main.ts's
			// startDaemon guard would otherwise treat the daemon as still "this session's").
			await stopDaemon(session);
			sessions.delete(session.id);
		}
		rekeySession(session, bus, device);
		session.name = null;
		session.status = "connecting" as DeviceStatus;
	} else {
		session = newSession(id, bus, device, window);
		sessionByWebContentsId.set(event.sender.id, session);
	}
	sessions.set(id, session);
	broadcastDevicesChanged();
	return { id };
});

ipcMain.handle("devices:switch-to", (_, bus: number, device: number) => {
	openOrFocusDevice(bus, device);
});

ipcMain.handle("devices:report-name", (event, name: string) => {
	const session = resolveSession(event);
	if (session) {
		session.name = name;
		broadcastDevicesChanged();
	}
});

ipcMain.handle("devices:report-status", (event, status: DeviceStatus) => {
	const session = resolveSession(event);
	if (session) {
		session.status = status;
		broadcastDevicesChanged();
	}
});

// --- Clipboard (routed through the OS clipboard, not renderer state, so
// copy/paste works across separate per-device windows/renderer processes) ---

ipcMain.handle("clipboard:write", (_, entry: unknown) => {
	clipboard.writeText(JSON.stringify({ __g2Clipboard: true, ...(entry as object) }));
});

ipcMain.handle("clipboard:read", () => {
	try {
		const parsed = JSON.parse(clipboard.readText());
		if (parsed && parsed.__g2Clipboard === true) {
			const { __g2Clipboard, ...rest } = parsed;
			return rest;
		}
	} catch {
		// clipboard holds non-JSON or non-G2 text — not ours to paste
	}
	return null;
});

ipcMain.handle("patches:list", async (_, folder: string) => {
	try {
		const names = fs.readdirSync(folder).sort();
		const entries = names.flatMap((name) => {
			const full = path.join(folder, name);
			try {
				const isDir = fs.statSync(full).isDirectory();
				return isDir || /\.(pch2|prf2)$/i.test(name) ? [{ name, path: full, isDir }] : [];
			} catch {
				return []; // broken symlink / unreadable entry
			}
		});
		return { success: true, entries };
	} catch (e: any) {
		return { success: false, error: e.message, code: e.code, entries: [] };
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
function assertSlot(slot: unknown): asserts slot is number {
	if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) > 3) throw new Error("Invalid slot");
}

ipcMain.handle("patches:init-load-path", (_, slot: number) => {
	assertSlot(slot);
	const initPath = path.join(app.getPath("userData"), "patches", `init-${slot}.pch2`);
	if (fs.existsSync(initPath)) return initPath;
	return path.join(builtinPatchesDir(), "EmptyPatch.pch2");
});

// Resolves the write target for "Save Init Patch N", ensuring its directory exists.
ipcMain.handle("patches:init-save-path", (_, slot: number) => {
	assertSlot(slot);
	const dir = path.join(app.getPath("userData"), "patches");
	fs.mkdirSync(dir, { recursive: true });
	return path.join(dir, `init-${slot}.pch2`);
});

// Bank Organizer storage area: userData/bank-storage, or the folder chosen in Editor Options.
// Each window has its own (its settings aren't live-synced to the others); windows sharing a folder
// share one watcher, which tells them when it changes (also catches the files the CLI writes there).
const storageDirByWc = new Map<number, string>();
const storageWatchers = new Map<string, fs.FSWatcher>();
// The organizer's undo history keeps its patch copies in <storage>/.g2-organizer-history; it lives until the
// app quits, so whatever an earlier run left there is removed the first time a folder is used.
const historyCleaned = new Set<string>();

// Closes the watchers of folders no window uses any more.
function pruneStorageWatchers(): void {
	const inUse = new Set(storageDirByWc.values());
	for (const [dir, watcher] of storageWatchers) {
		if (inUse.has(dir)) continue;
		watcher.close();
		storageWatchers.delete(dir);
	}
}

function storageDir(wcId: number, custom?: string): string {
	const dir = custom || path.join(app.getPath("userData"), "bank-storage");
	fs.mkdirSync(dir, { recursive: true });
	if (!historyCleaned.has(dir)) {
		historyCleaned.add(dir);
		fs.rmSync(path.join(dir, ".g2-organizer-history"), { recursive: true, force: true });
	}
	storageDirByWc.set(wcId, dir);
	if (!storageWatchers.has(dir)) {
		let timer: NodeJS.Timeout | null = null;
		const watcher = fs.watch(dir, () => {
			if (timer) clearTimeout(timer);
			// Sent only to the windows still using `dir` when it fires (none once it's pruned).
			timer = setTimeout(() => {
				for (const window of BrowserWindow.getAllWindows()) {
					if (!window.isDestroyed() && storageDirByWc.get(window.webContents.id) === dir) window.webContents.send("storage:changed");
				}
			}, 200);
		});
		// E.g. the folder was deleted or its drive unmounted: drop the watcher (an unhandled 'error'
		// would throw in the main process); the next storageDir() call recreates folder and watcher.
		watcher.on("error", () => {
			watcher.close();
			if (storageWatchers.get(dir) === watcher) storageWatchers.delete(dir);
		});
		storageWatchers.set(dir, watcher);
	}
	pruneStorageWatchers();
	return dir;
}

ipcMain.handle("patches:storage-dir", (event, custom?: string) => storageDir(event.sender.id, custom));

// Only files inside the calling window's storage folder (its .g2-organizer-history included) may be removed or copied.
function assertInStorage(wcId: number, filepath: string): string {
	const dir = storageDirByWc.get(wcId);
	const resolved = path.resolve(filepath);
	const rel = dir ? path.relative(path.resolve(dir), resolved) : "";
	if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Not a storage file");
	return resolved;
}

ipcMain.handle("patches:storage-remove", (event, filepath: string) => {
	fs.rmSync(assertInStorage(event.sender.id, filepath), { force: true });
});

ipcMain.handle("patches:storage-copy", (event, from: string, to: string) => {
	const dst = assertInStorage(event.sender.id, to);
	fs.mkdirSync(path.dirname(dst), { recursive: true });
	fs.copyFileSync(assertInStorage(event.sender.id, from), dst);
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
	if (typeof filepath !== "string" || !/\.(pch2|prf2)$/i.test(filepath)) throw new Error("Invalid file type");
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

ipcMain.handle("bank:select-folder", async (event, defaultPath?: string) => {
	const browserWin = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(browserWin!, {
		defaultPath: defaultPath || undefined,
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
	if (typeof shortName !== "string" || !/^[\w.&-]+$/.test(shortName)) return null;
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
		// Packaged: vite copies public/ into dist/ (which electron-builder ships); dev reads public/ directly.
		const fontPath = path.join(app.isPackaged ? RENDERER_DIST : path.join(process.env.APP_ROOT!, "public"), "fonts", "SairaCondensed-Bold.ttf");
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
	try {
		const buf = fs.readFileSync(filepath);
		return { success: true, filepath, data: Array.from(buf) };
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("app:info", () => ({
	version: app.getVersion(),
	platform: platformLabel,
	iconDataUrl: `data:image/png;base64,${fs.readFileSync(path.join(process.env.APP_ROOT!, "resources", "icon.png")).toString("base64")}`,
}));

ipcMain.handle("app:latestVersion", async (): Promise<string | null> => {
	// Tests never reach GitHub.
	if (process.env.NODE_ENV === "test") return null;
	try {
		const res = await fetch("https://api.github.com/repos/JanBurp/NordModularG2-Editor/releases/latest", { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		const { tag_name } = (await res.json()) as { tag_name?: string };
		return tag_name ? tag_name.replace(/^v/, "") : null;
	} catch {
		return null;
	}
});

ipcMain.on("shell:openExternal", (_, url: string) => {
	try {
		if (new URL(url).protocol === "https:") void shell.openExternal(url);
	} catch {
		// not a valid URL
	}
});

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
	isPerformanceMode: false,
};

// Focuses the next (or previous) device window in creation order, wrapping around —
// the Cmd+` native-app convention for cycling windows of the frontmost application.
function cycleWindow(direction: 1 | -1): void {
	const list = Array.from(sessions.values());
	if (list.length < 2) return;
	const idx = list.findIndex((s) => s === activeSession());
	const nextIdx = idx === -1 ? 0 : (idx + direction + list.length) % list.length;
	revealWindow(list[nextIdx].window);
}

// Creates a hidden-or-visible window pre-bound to (bus, device): registers its DeviceSession
// into both maps synchronously (before the renderer even loads) so the id is claimed
// immediately, closing the window between "decided to claim this device" and "renderer
// eventually calls devices:connect" that a caller could otherwise race through twice.
function registerNewSession(bus: number, device: number, cascadeIndex = 0, visible = false): DeviceSession {
	const window = createAppWindow(cascadeIndex, visible);
	const id = `${bus}:${device}`;
	const session: DeviceSession = {
		id,
		bus,
		device,
		name: null,
		status: "connecting" as DeviceStatus,
		window,
		daemonProcess: null,
		cmdId: 0,
		pendingCmds: new Map(),
		menuState: { ...defaultMenuState },
	};
	sessions.set(id, session);
	sessionByWebContentsId.set(window.webContents.id, session);
	pendingAssignment.set(window.webContents.id, { bus, device, showSplash: false });
	return session;
}

// Reveals (or opens) the window bound to (bus, device) — the single "pick this device"
// action shared by DeviceSwitcher and the Window menu. Sessions discovered via
// discoverDevices already have a (hidden) window and just need revealing; a bus/device
// with no session yet (not currently reachable from the UI, but kept as a safety fallback)
// gets a fresh one via registerNewSession, matching the parallel-startup path's pairing.
function openOrFocusDevice(bus: number, device: number): void {
	const id = `${bus}:${device}`;
	const existing = sessions.get(id);
	if (existing) {
		revealWindow(existing.window);
		return;
	}
	registerNewSession(bus, device, 0, true);
	broadcastDevicesChanged();
}

// Guards discoverDevices against overlapping invocations (e.g. two quick "Add Device..."
// clicks) racing on the same await listAttachedDevices() and both claiming the same
// not-yet-registered device — a second call while one is in flight is just a no-op.
let discoveryInFlight = false;

// Scans for currently-unclaimed G2s (device turned on after launch) and, for each one,
// pre-registers a DeviceSession bound to a hidden window right away — so it starts
// connecting (daemon, device_info/name, status) in the background immediately, the same
// way the parallel-startup path does, instead of waiting for the user to switch to it.
// The window stays hidden (no focus stolen from the current one) until openOrFocusDevice
// reveals it.
async function discoverDevices(): Promise<void> {
	if (discoveryInFlight) return;
	discoveryInFlight = true;
	try {
		const devices = await listAttachedDevices().catch(() => []);
		const unclaimed = devices.filter((d) => !d.alreadyConnected);
		if (unclaimed.length === 0) {
			await dialog.showMessageBox({
				type: "info",
				message: "No new devices found.",
				icon: path.join(process.env.APP_ROOT!, "resources", "icon.png"),
			});
			return;
		}
		unclaimed.forEach((d) => registerNewSession(d.bus, d.device));
		broadcastDevicesChanged();
	} finally {
		discoveryInFlight = false;
	}
}

function windowMenuItems(): Electron.MenuItemConstructorOptions[] {
	const list = Array.from(sessions.values());
	if (list.length === 0) return [{ label: "No Devices Connected", enabled: false }];
	return list.map((s) => ({
		label: s.name ?? `bus ${s.bus} dev ${s.device}`,
		type: "checkbox" as const,
		checked: s === activeSession(),
		click: () => revealWindow(s.window),
	}));
}

function buildMenu(recentFiles: RecentFileEntry[], menuState: MenuState): Electron.MenuItemConstructorOptions[] {
	const slotSubmenu = (actionPrefix: string): Electron.MenuItemConstructorOptions[] =>
		SLOT_LABELS.map((s) => ({ label: `Slot ${s}`, click: () => sendToFocused("menu:action", `${actionPrefix}-${s}`) }));

	return [
		...(isMac ? [{
			label: "G2 Editor",
			submenu: [
				{ label: "About G2 Editor...", click: () => sendToFocused("menu:action", "show-about") },
				{ label: "Preferences...", click: () => sendToFocused("menu:action", "toggle-settings"), accelerator: "CommandOrControl+," },
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
				{ label: "New Patch", click: () => sendToFocused("menu:action", "new-patch"), accelerator: "CommandOrControl+N" },
				{ label: "New Performance", click: () => sendToFocused("menu:action", "new-performance") },
				{ label: "New To", submenu: slotSubmenu("new-to") },
				{ type: "separator" as const },
				{ label: "Open", click: () => sendToFocused("menu:action", "open"), accelerator: "CommandOrControl+O" },
				{ label: "Open Performance", click: () => sendToFocused("menu:action", "open-performance") },
				{ label: "Open To", submenu: slotSubmenu("open-to") },
				{ type: "separator" as const },
				{ label: "Save", click: () => sendToFocused("menu:action", "save"), accelerator: "CommandOrControl+S" },
				{ label: "Save As", click: () => sendToFocused("menu:action", "save-as"), accelerator: "Shift+CommandOrControl+S" },
				{ label: "Save All", click: () => sendToFocused("menu:action", "save-all") },
				{ type: "separator" as const },
				{ label: "Save From", submenu: slotSubmenu("save-from") },
				{ label: "Save Init Patch 1", click: () => sendToFocused("menu:action", "save-init-1") },
				{ label: "Save Init Patch 2", click: () => sendToFocused("menu:action", "save-init-2") },
				{ type: "separator" as const },
				{
					label: "Recent Files",
					submenu: recentFiles.length
						? recentFiles.map((f, i) => ({ label: path.basename(f.path), click: () => sendToFocused("menu:action", `open-recent:${i}`) }))
						: [{ label: "(Empty)", enabled: false }],
				},

			],
		},
		{
			label: "Edit",
			submenu: [
				{ label: "Undo", click: () => sendToFocused("menu:action", "undo"), accelerator: "CommandOrControl+Z", enabled: menuState.canUndo },
				{
					label: "Redo",
					click: () => sendToFocused("menu:action", "redo"),
					accelerator: "Shift+CommandOrControl+Z",
					enabled: menuState.canRedo,
				},
				{ type: "separator" as const },
				{ label: "Cut", click: () => sendToFocused("menu:action", "cut"), accelerator: "CommandOrControl+X" },
				{
					label: "Copy",
					click: () => sendToFocused("menu:action", "copy"),
					accelerator: "CommandOrControl+C",
				},
				{
					label: "Paste",
					click: () => sendToFocused("menu:action", "paste"),
					accelerator: "CommandOrControl+V",
					enabled: menuState.hasClipboard,
				},
				{
					label: "Clear",
					click: () => sendToFocused("menu:action", "delete"),
					accelerator: "Backspace",
				},
				{ type: "separator" as const },
				{
					label: "Paste Params",
					click: () => sendToFocused("menu:action", "paste-params"),
					accelerator: "CommandOrControl+E",
					enabled: menuState.hasClipboard,
				},
				{ type: "separator" as const },
				{ label: "Select All", click: () => sendToFocused("menu:action", "select-all"), accelerator: "CommandOrControl+A" },
				{ type: "separator" as const },
				{
					label: "Find & Replace...",
					click: () => sendToFocused("menu:action", "toggle-search-replace"),
					enabled: menuState.hasCurrentPatch,
				},
			],
		},
		{
			label: "View",
			submenu: [
				{ label: "Voice Area", click: () => sendToFocused("menu:action", "area-voice"), accelerator: "V" },
				{ label: "FX Area", click: () => sendToFocused("menu:action", "area-fx"), accelerator: "F" },
				{ type: "separator" as const },
				{ label: "Slot A", click: () => sendToFocused("menu:action", "slot-A"), accelerator: "A" },
				{ label: "Slot B", click: () => sendToFocused("menu:action", "slot-B"), accelerator: "B" },
				{ label: "Slot C", click: () => sendToFocused("menu:action", "slot-C"), accelerator: "C" },
				{ label: "Slot D", click: () => sendToFocused("menu:action", "slot-D"), accelerator: "D" },
				{ type: "separator" as const },
				{ label: "Variation 1", click: () => sendToFocused("menu:action", "variation-1"), accelerator: "1" },
				{ label: "Variation 2", click: () => sendToFocused("menu:action", "variation-2"), accelerator: "2" },
				{ label: "Variation 3", click: () => sendToFocused("menu:action", "variation-3"), accelerator: "3" },
				{ label: "Variation 4", click: () => sendToFocused("menu:action", "variation-4"), accelerator: "4" },
				{ label: "Variation 5", click: () => sendToFocused("menu:action", "variation-5"), accelerator: "5" },
				{ label: "Variation 6", click: () => sendToFocused("menu:action", "variation-6"), accelerator: "6" },
				{ label: "Variation 7", click: () => sendToFocused("menu:action", "variation-7"), accelerator: "7" },
				{ label: "Variation 8", click: () => sendToFocused("menu:action", "variation-8"), accelerator: "8" },
				{ type: "separator" as const },
				{ label: "Zoom In", click: () => sendToFocused("menu:action", "zoom-in"), accelerator: "CommandOrControl+=" },
				{ label: "Zoom Out", click: () => sendToFocused("menu:action", "zoom-out"), accelerator: "CommandOrControl+-" },
				{ label: "Actual Size", click: () => sendToFocused("menu:action", "zoom-reset"), accelerator: "CommandOrControl+0" },
			],
		},
		{
			label: "Patch",
			submenu: [
				{
					label: "Patch Settings",
					click: () => sendToFocused("menu:action", "open-patch-settings"),
					accelerator: "CommandOrControl+P",
					enabled: menuState.hasCurrentPatch,
				},
				{ label: "Text Panel", click: () => sendToFocused("menu:action", "toggle-text-panel"), accelerator: "CommandOrControl+J" },
				{ type: "separator" as const },
				{ label: "Delete Unused Modules", click: () => sendToFocused("menu:action", "delete-unused-modules") },
				{ label: "Delete Unused Cables", click: () => sendToFocused("menu:action", "delete-unused-cables") },
				{ type: "separator" as const },
				{
					label: "Download to Slot",
					click: () => sendToFocused("menu:action", "download-to-slot"),
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
					click: () => sendToFocused("menu:action", "open-performance-settings"),
					accelerator: "CommandOrControl+R",
					enabled: menuState.isPerformanceMode,
				},
				{ type: "separator" as const },
				{ label: "Download", click: () => sendToFocused("menu:action", "download-performance"), enabled: menuState.connected && menuState.hasPerformanceContext },
			],
		},
		{
			label: "Synth",
			submenu: [
				{
					label: "Synth Settings",
					click: () => sendToFocused("menu:action", "open-synth-settings"),
					accelerator: "CommandOrControl+G",
					enabled: menuState.connected,
				},
				{ type: "separator" as const },
				{
					label: "Upload Active Slot",
					click: () => sendToFocused("menu:action", "upload-active-slot"),
					accelerator: "CommandOrControl+U",
					enabled: menuState.connected,
				},
				{
					label: "Save in Synth",
					click: () => sendToFocused("menu:action", "store-in-synth"),
					accelerator: "Alt+S",
					enabled: menuState.connected && menuState.hasCurrentPatch,
				},
				{ type: "separator" as const },
				{ label: "Bank Upload (from G2)", click: () => sendToFocused("menu:action", "bank-upload"), enabled: menuState.connected },
				{ label: "Bank Download (to G2)", click: () => sendToFocused("menu:action", "bank-download"), enabled: menuState.connected },
				{ type: "separator" as const },
				{
					label: "Send Controller Snapshot",
					click: () => sendToFocused("menu:action", "send-controller-snapshot"),
					accelerator: "CommandOrControl+M",
					enabled: menuState.connected,
				},
				{
					label: "Dump One",
					click: () => sendToFocused("menu:action", "dump-one"),
					accelerator: "CommandOrControl+1",
					enabled: menuState.connected,
				},
			],
		},
		{
			label: "Setup",
			submenu: [
				{ label: "Editor Options", click: () => sendToFocused("menu:action", "toggle-settings"), accelerator: "CommandOrControl+," },
			],
		},
		{
			label: "Tools",
			submenu: [
				{ label: "Parameter Pages", click: () => sendToFocused("menu:action", "toggle-parameter-pages"), accelerator: "CommandOrControl+F" },
				{ label: "Keyboard", click: () => sendToFocused("menu:action", "toggle-keyboard"), accelerator: "CommandOrControl+K" },
				{ label: "Browser", click: () => sendToFocused("menu:action", "toggle-browser"), accelerator: "CommandOrControl+B" },
				{ type: "separator" as const },
				{ label: "Modules", click: () => sendToFocused("menu:action", "toggle-modules"), accelerator: "CommandOrControl+L" },
				{ label: "Parameter Overview", click: () => sendToFocused("menu:action", "toggle-parameter-overview"), accelerator: "Shift+CommandOrControl+F" },
				{ label: "Midi CC Panel", click: () => sendToFocused("menu:action", "toggle-midi-cc-panel"), accelerator: "CommandOrControl+I" },
				{ type: "separator" as const },
				{ label: "Patch Adjuster & Mutator", click: () => sendToFocused("menu:action", "toggle-patch-mutator"), accelerator: "CommandOrControl+2" },
				{ label: "Bank Organizer", click: () => sendToFocused("menu:action", "toggle-bank-organizer"), accelerator: "CommandOrControl+3" },
				{ type: "separator" as const },
				{ label: "Extended Toolbar", click: () => sendToFocused("menu:action", "toggle-extended-toolbar"), accelerator: "CommandOrControl+T" },
			],
		},
		{
			label: "Window",
			submenu: [
				...windowMenuItems(),
				{ type: "separator" as const },
				{
					// No accelerator: CommandOrControl+` is macOS's own reserved "cycle windows of the
					// frontmost app" shortcut, which already works for any standard multi-window app
					// (including this one) without us registering anything — doing so ourselves risked
					// conflicting with (and breaking) that native behavior instead of complementing it.
					// (Tried registering it ourselves to also reach a still-hidden discovered device —
					// didn't work reliably, reverted; a hidden window still won't respond to Cmd+` until
					// it's been revealed once via DeviceSwitcher/Window menu.)
					label: "Cycle to Next Window",
					enabled: sessions.size > 1,
					click: () => cycleWindow(1),
				},
				{ type: "separator" as const },
				{ label: "Add Device...", click: () => { void discoverDevices(); } },
			],
		},
		{
			label: "Help",
			submenu: [
				{ label: "Module Help", accelerator: "F1", click: () => sendToFocused("menu:action", "show-module-help") },
				{ label: "Key Commands", click: () => sendToFocused("menu:action", "show-key-commands") },
				{ type: "separator" as const },
				{ label: "Toggle DevTools", role: "toggleDevTools" as const, accelerator: "CommandOrControl+Option+I" },
				{ label: "ShowSVG", click: () => sendToFocused("menu:action", "toggle-svg-viewer") },
				{ type: "separator" as const },
				{ label: "Donate...", click: () => { void shell.openExternal(DONATE_URL); } },
				{ label: "About G2 Editor...", click: () => sendToFocused("menu:action", "show-about") },
			],
		},
	];
}

let lastRecentFiles: RecentFileEntry[] = [];
// Fallback menu state for a window that has no bound DeviceSession yet (e.g. the
// initial window before a device is chosen) — mirrors what used to be the single
// global menuState singleton.
let lastMenuState: MenuState = defaultMenuState;

function currentMenuState(): MenuState {
	return activeSession()?.menuState ?? lastMenuState;
}

// Windows/Linux: each window has its own menu bar showing its own session's state. Swapping
// every window's menu (via setApplicationMenu) on focus change broke all accelerators on Windows
// after switching windows, while clicking the menu items still worked.
function applyWindowMenu(window: BrowserWindow): void {
	const menuState = sessionByWebContentsId.get(window.webContents.id)?.menuState ?? lastMenuState;
	window.setMenu(Menu.buildFromTemplate(buildMenu(lastRecentFiles, menuState)));
}

function refreshMenu(): void {
	if (isMac) Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu(lastRecentFiles, currentMenuState())));
	else for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) applyWindowMenu(window);
}

ipcMain.on("recent-files:update", (_, files: RecentFileEntry[]) => {
	lastRecentFiles = files;
	refreshMenu();
});

ipcMain.on("menu-state:update", (event, state: MenuState) => {
	const session = resolveSession(event);
	if (session) session.menuState = state;
	else lastMenuState = state;
	if (!isMac) {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (window) applyWindowMenu(window);
	} else if (session ? session === activeSession() : !activeSession()) refreshMenu();
});

app.on("browser-window-focus", (_event, window) => {
	activeWebContentsId = window.webContents.id;
	if (isMac) refreshMenu();
});

app.on("child-process-gone", (_e, details) => console.log(`[app] child process gone: ${details.type} ${details.reason} (exit ${details.exitCode})`));

let quitting = false;
app.on("before-quit", (e) => {
	if (!quitting) console.log("[app] quit requested");
	if (quitting) return;
	e.preventDefault();
	quitting = true;
	(async () => {
		await Promise.all(Array.from(sessions.values()).map((s) => stopDaemon(s)));
		app.quit();
	})();
});

app.whenReady().then(async () => {
	if (!gotInstanceLock) return;
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

	// Auto-bind every not-yet-connected G2 found in parallel, one window each — no
	// picker, matching devices:connect's existing single-device "no picker" behavior.
	// Falls back to one plain window (today's offline/no-device behavior) if
	// enumeration fails (e.g. CLI binary missing in dev), nothing is attached, or
	// VITE_DEV_OFFLINE is set (renderer-side offline mode expects exactly one
	// hardware-agnostic window — see isOffline in preload.ts).
	const devices = process.env.VITE_DEV_OFFLINE === 'true' ? [] : await listAttachedDevices().catch(() => []);
	const unclaimed = devices.filter((d) => !d.alreadyConnected);
	if (unclaimed.length === 0) {
		createAppWindow();
	} else {
		// Each window's own show()/maximize() call (in createAppWindow) steals focus from
		// whichever window was shown before it, so the LAST one created ends up frontmost —
		// that's the one the user actually sees at startup, so it's the one that gets the splash.
		const frontmostIndex = unclaimed.length - 1;
		unclaimed.forEach((d, i) => {
			const window = createAppWindow(i);
			if (i === frontmostIndex) startupSplashClaimed = true;
			pendingAssignment.set(window.webContents.id, { bus: d.bus, device: d.device, showSplash: i === frontmostIndex });
			// Start the daemon now instead of after the renderer has loaded and mounted, so USB init
			// overlaps renderer boot; its events are held until the renderer calls cli:watch-start.
			const session = newSession(d.id, d.bus, d.device, window);
			session.earlyEvents = [];
			sessionByWebContentsId.set(window.webContents.id, session);
			startDaemon(session);
		});
	}

	refreshMenu();
});
