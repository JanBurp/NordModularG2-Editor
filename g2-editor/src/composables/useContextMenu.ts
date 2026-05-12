import { reactive } from 'vue';
import type { ContextMenuItem } from '../types';

const state = reactive({
	visible: false,
	x: 0,
	y: 0,
	items: [] as ContextMenuItem[],
});

let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function useContextMenu() {
	function open(event: MouseEvent, items: ContextMenuItem[]) {
		if (items.length === 0) return;
		event.preventDefault();
		event.stopPropagation();
		state.x = event.clientX;
		state.y = event.clientY;
		state.items = items;
		state.visible = true;
	}

	function close() {
		state.visible = false;
	}

	function scheduleClose(ms = 300) {
		closeTimer = setTimeout(close, ms);
	}

	function cancelClose() {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	}

	return { state, open, close, scheduleClose, cancelClose };
}
