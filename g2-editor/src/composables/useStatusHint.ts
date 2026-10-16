import { useUiStore } from '@/store/ui';
import { STATUS_HINTS, type StatusHintKey } from '@/constants/statusHints';

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
