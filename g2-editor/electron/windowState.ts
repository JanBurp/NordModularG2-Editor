import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import fs from "node:fs";
import path from "node:path";

interface WindowState extends Rectangle {
	isMaximized: boolean;
}

function stateFile(): string {
	return path.join(app.getPath("userData"), "window-state.json");
}

function isOnScreen(bounds: Rectangle): boolean {
	return screen.getAllDisplays().some((d) => {
		const a = d.workArea;
		return bounds.x < a.x + a.width && bounds.x + bounds.width > a.x
			&& bounds.y < a.y + a.height && bounds.y + bounds.height > a.y;
	});
}

export function loadWindowState(): WindowState | null {
	try {
		const state = JSON.parse(fs.readFileSync(stateFile(), "utf-8")) as WindowState;
		const valid = [state.width, state.height, state.x, state.y].every((n) => typeof n === "number");
		if (!valid || !isOnScreen(state)) return null;
		return state;
	} catch {
		return null;
	}
}

export function trackWindowState(win: BrowserWindow) {
	let timeout: ReturnType<typeof setTimeout> | null = null;

	const save = () => {
		const state: WindowState = { ...win.getNormalBounds(), isMaximized: win.isMaximized() };
		fs.writeFileSync(stateFile(), JSON.stringify(state));
	};

	const scheduleSave = () => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(save, 500);
	};

	win.on("resize", scheduleSave);
	win.on("move", scheduleSave);
	win.on("close", () => {
		if (timeout) clearTimeout(timeout);
		save();
	});
}
