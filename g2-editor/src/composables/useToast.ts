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
