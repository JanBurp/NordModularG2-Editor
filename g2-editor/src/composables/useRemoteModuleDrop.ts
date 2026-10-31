import type { ClipboardEntry } from '@/types/patch';
import { onMounted, onUnmounted } from 'vue';
import { MODULE_ROW_HEIGHT, MODULE_WIDTH } from '@/constants';
import { getModule } from '../renderer/nmg2mods';
import { svgClientToGrid } from '../renderer/svgUtils';
import { useUiStore } from '../store/ui';
import { useDeviceStore } from '../store/device';
import { insertEntry } from './usePatchClipboard';

// Drop end of a module drag from another G2's window (source: useModuleDrag.ts, routed by the
// main process): hovering shows a drop ghost on the canvas under the cursor, dropping pastes a
// copy there through the regular paste path. Install once per window (App.vue).
export function useRemoteModuleDrop() {
	const ui = useUiStore();
	const device = useDeviceStore();

	// Canvas grid position under a client point, null outside both canvases.
	function locate(clientX: number, clientY: number): { col: number; row: number; area: 'va' | 'fx' } | null {
		const canvas = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-canvas-area]');
		const grid = canvas && svgClientToGrid(canvas.querySelector('svg'), clientX, clientY);
		return grid ? { ...grid, area: canvas.dataset.canvasArea as 'va' | 'fx' } : null;
	}

	onMounted(() => {
		const api = window.electronAPI?.drag;
		api?.onHover(({ clientX, clientY, entry }) => {
			const pos = device.resyncing ? null : locate(clientX, clientY);
			ui.remoteDrag = pos ? { ...pos, entry } : null;
		});
		api?.onLeave(() => (ui.remoteDrag = null));
		api?.onDrop(({ clientX, clientY, entry }) => {
			ui.remoteDrag = null;
			if (device.resyncing) return; // edits would collide with the post-reconnect performance re-send
			const pos = locate(clientX, clientY);
			if (pos && entry.modules.length > 0) void insertEntry(entry, pos);
		});
	});
	onUnmounted(() => window.electronAPI?.drag?.off());
}

// Ghost rects for the hovering remote drag in one canvas area: the copied block with its top-left
// module at the hovered cell, as insertEntry will place it (before any collision row shift).
export function remoteDragGhosts(
	drag: { col: number; row: number; area: 'va' | 'fx'; entry: ClipboardEntry } | null,
	area: 'va' | 'fx',
): { idx: number; x: number; y: number; height: number }[] {
	if (!drag || drag.area !== area) return [];
	const minCol = Math.min(...drag.entry.modules.map((m) => m.horiz));
	const minRow = Math.min(...drag.entry.modules.map((m) => m.vert));
	return drag.entry.modules.map((m) => ({
		idx: m.index,
		x: (m.horiz - minCol + drag.col) * MODULE_WIDTH,
		y: (m.vert - minRow + drag.row) * MODULE_ROW_HEIGHT,
		height: (getModule(m.type)?.height ?? 2) * MODULE_ROW_HEIGHT,
	}));
}
