import { useUiStore } from '@/store/ui';
import { STATUS_HINTS, type StatusHintKey } from '@/constants/statusHints';

export function useStatusHint() {
	const uiStore = useUiStore();

	function showHint(key: StatusHintKey): void {
		uiStore.statusHint = STATUS_HINTS[key];
	}
	function clearHint(): void {
		uiStore.statusHint = null;
	}

	return { showHint, clearHint };
}
