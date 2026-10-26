import { reactive } from 'vue';

export interface ToastEntry {
	id: number;
	message: string;
	error?: boolean;
	action?: ToastAction;
	key?: string;
}

export interface ToastAction {
	label: string;
	run: () => Promise<boolean>; // false keeps the toast open (e.g. the action failed)
}

const TOAST_DURATION_MS = 5000;

let nextId = 0;
const toasts = reactive<ToastEntry[]>([]);

export function dismissToast(id: number): void {
	const idx = toasts.findIndex((t) => t.id === id);
	if (idx >= 0) toasts.splice(idx, 1);
}

// A failed window.cli.run as toast text: without Electron's IPC prefix, and a G2 flash refusal
// ("store-patch: device refused 32-120 (Memory protect on)", "clear-bank: device refused bank 32 (...)")
// as "<action> failed at 32-120: Memory protect on".
export function cliErrorText(e: unknown, action?: string): string {
	const msg = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
	const refused = action ? /device refused (\d+-\d+|bank \d+) \((.+)\)$/.exec(msg) : null;
	return refused ? `${action} failed at ${refused[1]}: ${refused[2]}` : msg;
}

export function showToast(message: string): void {
	const id = nextId++;
	toasts.push({ id, message });
	setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
}

// Error toasts stay until the user dismisses them (× or OK), or the optional action succeeds.
// A toast with the same key as one still showing is not added again.
export function showErrorToast(message: string, action?: ToastAction, key?: string): void {
	if (key && toasts.some((t) => t.key === key)) return;
	toasts.push({ id: nextId++, message, error: true, action, key });
}

export function dismissToastByKey(key: string): void {
	const t = toasts.find((t) => t.key === key);
	if (t) dismissToast(t.id);
}

export async function runToastAction(t: ToastEntry): Promise<void> {
	if (await t.action?.run()) dismissToast(t.id);
}

// Shared across every caller (components and Pinia stores alike) — not a per-component composable.
export function useToast() {
	return { toasts, showToast, showErrorToast, dismissToast, runToastAction };
}
