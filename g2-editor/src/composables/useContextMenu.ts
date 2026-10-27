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
		state.items = cleanSeparators(items);
		state.visible = true;
	}

	// Drop leading, trailing and repeated separators, in submenus too (callers splice in item groups that may be empty).
	function cleanSeparators(items: ContextMenuItem[]): ContextMenuItem[] {
		const cleaned: ContextMenuItem[] = [];
		for (const it of items) {
			if (it.type === 'separator' && (!cleaned.length || cleaned.at(-1)!.type === 'separator')) continue;
			cleaned.push(it.children ? { ...it, children: cleanSeparators(it.children) } : it);
		}
		if (cleaned.at(-1)?.type === 'separator') cleaned.pop();
		return cleaned;
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
