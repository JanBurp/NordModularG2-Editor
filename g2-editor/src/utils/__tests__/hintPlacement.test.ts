import { describe, expect, it } from 'vitest';
import { paramHintCenter } from '@/utils/hintPlacement';
import { layoutBadges } from '@/utils/badgeLayout';

// 20x20 control at (100,100): centre (110,110), offsets sx = (20+40)/2 = 30, sy = trunc((20+15)/2) = 17.
const ctrl = { x: 100, y: 100, w: 20, h: 20 };
const view = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('paramHintCenter (CPanel::GetParamHintCenter)', () => {
	it('places the hint diagonally below-right when it fits', () => {
		expect(paramHintCenter(ctrl, view(0, 0, 1000, 1000))).toEqual({ x: 140, y: 127 });
	});

	it('falls back to above-left at the bottom-right viewport edge', () => {
		expect(paramHintCenter(ctrl, view(0, 0, 150, 130))).toEqual({ x: 80, y: 93 });
	});

	it('then tries left, above, right and below, 3 px further out', () => {
		// Above-left fails (too high), left fits.
		expect(paramHintCenter(ctrl, view(0, 100, 150, 20))).toEqual({ x: 77, y: 110 });
		// Nothing fits: control centre.
		expect(paramHintCenter(ctrl, view(105, 105, 10, 10))).toEqual({ x: 110, y: 110 });
	});
});

describe('layoutBadges (CHintViewList::AdjustHintPosition)', () => {
	const box = (y: number, group: number) => ({ x: 0, y, width: 20, height: 14, group });

	it('moves an overlapping badge of the same group down by its height + 2', () => {
		expect(layoutBadges([box(0, 1), box(5, 1)]).map((b) => b.y)).toEqual([0, 21]);
	});

	it('leaves overlapping badges of different groups alone', () => {
		expect(layoutBadges([box(0, 1), box(5, 2)]).map((b) => b.y)).toEqual([0, 5]);
	});
});
