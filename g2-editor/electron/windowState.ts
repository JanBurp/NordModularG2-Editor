import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface WindowState extends Rectangle {
	isMaximized: boolean;
}

function stateFile(): string {
	return path.join(app.getPath('userData'), 'window-state.json');
}

function isOnScreen(bounds: Rectangle): boolean {
	return screen.getAllDisplays().some((d) => {
		const a = d.workArea;
		return bounds.x < a.x + a.width && bounds.x + bounds.width > a.x && bounds.y < a.y + a.height && bounds.y + bounds.height > a.y;
	});
}

export function loadWindowState(): WindowState | null {
	try {
		const state = JSON.parse(fs.readFileSync(stateFile(), 'utf-8')) as WindowState;
		const valid = [state.width, state.height, state.x, state.y].every((n) => typeof n === 'number');
		if (!valid || !isOnScreen(state)) return null;
		return state;
	} catch {
		return null;
	}
}

// cascade is the offset createAppWindow added to the saved position; it is removed again on save
// so cascaded windows don't walk the shared base position down-right on every launch.
export function trackWindowState(win: BrowserWindow, cascade = 0) {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let shown = win.isVisible();
	win.once('show', () => {
		shown = true;
	});

	const save = () => {
		if (!shown || win.isDestroyed()) return;
		const b = win.getNormalBounds();
		const state: WindowState = { ...b, x: b.x - cascade, y: b.y - cascade, isMaximized: win.isMaximized() };
		try {
			fs.writeFileSync(stateFile(), JSON.stringify(state));
		} catch (e) {
			console.warn('Failed to save window state:', e);
		}
	};

	const scheduleSave = () => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(save, 500);
	};

	win.on('resize', scheduleSave);
	win.on('move', scheduleSave);
	win.on('close', () => {
		if (timeout) clearTimeout(timeout);
		save();
	});
}
