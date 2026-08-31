import { reactive } from 'vue';

export interface ToastEntry {
	id: number;
	message: string;
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

// Shared across every caller (components and Pinia stores alike) — not a per-component composable.
export function useToast() {
	return { toasts, showToast, dismissToast };
}
