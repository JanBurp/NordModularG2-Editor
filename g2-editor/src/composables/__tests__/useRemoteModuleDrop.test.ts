import { describe, expect, it, vi } from 'vitest';
import * as nmg2mods from '@/renderer/nmg2mods';
import { remoteDragGhosts } from '../useRemoteModuleDrop';

const entry = {
	modules: [
		{ index: 7, type: 1, horiz: 2, vert: 4 },
		{ index: 8, type: 1, horiz: 3, vert: 9 },
	],
	cables: [],
	area: 'va' as const,
	copiedVariation: 0,
} as any;

describe('remoteDragGhosts', () => {
	it('draws the dragged block with its top-left module at the hovered cell', () => {
		vi.spyOn(nmg2mods, 'getModule').mockReturnValue({ height: 3 } as any);
		expect(remoteDragGhosts({ col: 1, row: 2, area: 'fx', entry }, 'fx')).toEqual([
			{ idx: 7, x: 256, y: 32, height: 48 },
			{ idx: 8, x: 512, y: 112, height: 48 },
		]);
	});

	it('is empty for the other area and when nothing hovers', () => {
		expect(remoteDragGhosts({ col: 1, row: 2, area: 'fx', entry }, 'va')).toEqual([]);
		expect(remoteDragGhosts(null, 'fx')).toEqual([]);
	});
});
