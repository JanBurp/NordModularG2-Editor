// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { ModuleInstance } from '@/types';
import { morphHintCenter, paramControlRect, paramControlRects, paramHintCenter } from '@/utils/hintPlacement';
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

describe('morphHintCenter (CMorphContainer::GetParamHintCenter)', () => {
	it('puts a knob hint 35 px right, or left when that does not fit', () => {
		expect(morphHintCenter(ctrl, view(0, 0, 1000, 1000), 'morph', 3)).toEqual({ x: 145, y: 110 });
		expect(morphHintCenter(ctrl, view(0, 0, 150, 1000), 'morph', 3)).toEqual({ x: 75, y: 110 });
	});

	it('puts a mode button hint 18 px up, nudged for the first and last group', () => {
		expect(morphHintCenter(ctrl, null, 'morphMode', 3)).toEqual({ x: 110, y: 92 });
		expect(morphHintCenter(ctrl, null, 'morphMode', 0)).toEqual({ x: 111, y: 92 });
		expect(morphHintCenter(ctrl, null, 'morphMode', 7)).toEqual({ x: 105, y: 92 });
	});
});

describe('paramControlRects', () => {
	// Module 3 at column 1, row 2 = canvas offset (256, 32); type 9999 has no definition, so an
	// unrendered param falls back to the module origin.
	const mod = { index: 3, type: 9999, horiz: 1, vert: 2 } as unknown as ModuleInstance;
	function renderParam(location: number, paramIndex: number, box: { x: number; y: number; width: number; height: number }) {
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGraphicsElement;
		g.setAttribute('data-module-index', '3');
		g.setAttribute('data-param-location', String(location));
		g.setAttribute('data-param-index', String(paramIndex));
		g.getBBox = () => box as ReturnType<SVGGraphicsElement['getBBox']>;
		document.body.appendChild(g);
	}
	afterEach(() => document.body.replaceChildren());

	it('matches paramControlRect for rendered and unrendered params of the area', () => {
		renderParam(1, 0, { x: 10, y: 20, width: 30, height: 40 });
		renderParam(0, 1, { x: 5, y: 5, width: 5, height: 5 });
		const rect = paramControlRects('va');
		expect(rect(mod, 0)).toEqual({ x: 266, y: 52, w: 30, h: 40 });
		expect(rect(mod, 1)).toEqual({ x: 256, y: 32, w: 0, h: 0 });
		for (const i of [0, 1]) expect(rect(mod, i)).toEqual(paramControlRect(mod, i, 'va'));
	});
});
