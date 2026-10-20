import { useUiStore } from '@/store/ui';
import { STATUS_HINTS, MOD, ALT, type StatusHintKey } from '@/constants/statusHints';

export interface HintPart {
	key: string;
	text: string;
}

const MODIFIERS = ['Shift', MOD, ALT];

// 'Key: text · Shift-key/key2: text' → the parts for one modifier (null = plain gestures). Shows the
// held modifier's parts if it has any, otherwise the plain ones; `mods` lists the other modifiers
// that have actions.
export function groupHint(hint: string, held: string | null): { parts: HintPart[]; mods: string[] } {
	const buckets = new Map<string | null, HintPart[]>();
	for (const part of hint.split(' · ')) {
		const i = part.indexOf(': ');
		if (i < 0) {
			buckets.set(null, [...(buckets.get(null) ?? []), { key: '', text: part }]);
			continue;
		}
		const text = part.slice(i + 2);
		const keys = new Map<string | null, string[]>();
		for (const key of part.slice(0, i).split('/')) {
			const mod = MODIFIERS.find((m) => key.startsWith(`${m}-`)) ?? null;
			keys.set(mod, [...(keys.get(mod) ?? []), key]);
		}
		for (const [mod, k] of keys) buckets.set(mod, [...(buckets.get(mod) ?? []), { key: k.join('/'), text }]);
	}
	const mod = held && buckets.has(held) ? held : null;
	return { parts: buckets.get(mod) ?? [], mods: MODIFIERS.filter((m) => m !== mod && buckets.has(m)) };
}

// While a mouse button is held (drag in progress) hover enter/leave keeps firing on whatever the
// cursor crosses; park the latest request and apply it on release so the hint stays put mid-drag.
let held = false;
let pending: string | null | undefined;

export function holdHints(): void {
	held = true;
}
export function releaseHints(): void {
	held = false;
	if (pending !== undefined) useUiStore().statusHint = pending;
	pending = undefined;
}

export function useStatusHint() {
	const uiStore = useUiStore();

	function setHint(text: string | null): void {
		if (held) pending = text;
		else uiStore.statusHint = text;
	}
	function showHint(key: StatusHintKey): void {
		setHint(STATUS_HINTS[key]);
	}
	function clearHint(): void {
		setHint(null);
	}

	return { showHint, clearHint };
}
