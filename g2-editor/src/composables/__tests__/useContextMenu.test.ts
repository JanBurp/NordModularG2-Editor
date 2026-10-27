import { describe, expect, it } from 'vitest';
import { useContextMenu } from '@/composables/useContextMenu';

describe('useContextMenu.open', () => {
	it('drops leading, trailing and repeated separators', () => {
		const { state, open } = useContextMenu();
		const sep = { type: 'separator' as const };
		open({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 } as MouseEvent, [sep, { label: 'A' }, sep, sep, { label: 'B' }, sep]);
		expect(state.items).toEqual([{ label: 'A' }, sep, { label: 'B' }]);
	});

	it('cleans separators inside submenus too', () => {
		const { state, open } = useContextMenu();
		const sep = { type: 'separator' as const };
		open({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 } as MouseEvent, [
			{ label: 'Sub', children: [sep, { label: 'A' }, sep, sep, { label: 'B' }, sep] },
		]);
		expect(state.items).toEqual([{ label: 'Sub', children: [{ label: 'A' }, sep, { label: 'B' }] }]);
	});
});
