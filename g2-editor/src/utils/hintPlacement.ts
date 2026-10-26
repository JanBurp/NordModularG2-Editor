import type { ModuleInstance } from '@/types';
import { getModule } from '@/renderer/nmg2mods';
import { clientToSvgPoint } from '@/renderer/svgUtils';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants/ui';

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
type Point = { x: number; y: number };

// A param control's rect in canvas coords, measured from its rendered <g> in Module.vue (control
// sizes vary per type/bitmap); falls back to the param's origin before it has rendered.
export function paramControlRect(mod: ModuleInstance, paramIndex: number, area: 'va' | 'fx'): Rect {
	const x = (mod.horiz ?? 0) * MODULE_WIDTH;
	const y = (mod.vert ?? 0) * MODULE_ROW_HEIGHT;
	const location = area === 'va' ? 1 : 0;
	const el = document.querySelector<SVGGraphicsElement>(
		`g[data-module-index="${mod.index}"][data-param-location="${location}"][data-param-index="${paramIndex}"]`,
	);
	const box = el?.getBBox?.();
	if (box) return { x: x + box.x, y: y + box.y, w: box.width, h: box.height };
	const param = getModule(mod.type)?.params?.[paramIndex];
	return { x: x + (param?.x ?? 0), y: y + (param?.y ?? 0), w: 0, h: 0 };
}

export function rectCenter(r: Rect): Point {
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// The visible (scrolled) part of a patch canvas, in canvas coords.
export function canvasViewport(svg: SVGSVGElement | null | undefined): Rect | null {
	const wrapper = svg?.parentElement;
	if (!svg || !wrapper) return null;
	const r = wrapper.getBoundingClientRect();
	const left = r.left + wrapper.clientLeft;
	const top = r.top + wrapper.clientTop;
	const a = clientToSvgPoint(svg, left, top);
	const b = clientToSvgPoint(svg, left + wrapper.clientWidth, top + wrapper.clientHeight);
	return a && b ? { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } : null;
}

// Whether a nominal 40x15 hint box centred on p fits completely inside b (no bounds = always).
const inside = (p: Point, b: Rect | null) => !b || (p.x - 20 >= b.x && p.y - 7.5 >= b.y && p.x + 20 <= b.x + b.w && p.y + 7.5 <= b.y + b.h);

// CPanel::GetParamHintCenter: centre of a hover/press/change hint. A nominal 40x15 box is tried
// diagonally below-right of the control, then above-left, then (3 px further out) left, above,
// right and below; the first that fits completely inside the viewport wins, else the control centre.
export function paramHintCenter(ctrl: Rect, viewport: Rect | null): Point {
	const c = rectCenter(ctrl);
	const sx = Math.trunc((ctrl.w + 40) / 2);
	const sy = Math.trunc((ctrl.h + 15) / 2);
	const offsets = [
		[sx, sy],
		[-sx, -sy],
		[-(sx + 3), 0],
		[0, -(sy + 3)],
		[sx + 3, 0],
		[0, sy + 3],
	];
	for (const [dx, dy] of offsets) {
		const p = { x: c.x + dx, y: c.y + dy };
		if (inside(p, viewport)) return p;
	}
	return c;
}

// CMorphContainer::GetParamHintCenter: a morph group knob's hint sits 35 px right of the knob
// centre, or 35 px left when that doesn't fit in the morph container; a mode button's sits 18 px
// above it (group 1's 1 px right, group 8's 5 px left).
export function morphHintCenter(ctrl: Rect, bounds: Rect | null, place: 'morph' | 'morphMode', group: number): Point {
	const c = rectCenter(ctrl);
	if (place === 'morphMode') return { x: c.x + (group === 0 ? 1 : group === 7 ? -5 : 0), y: c.y - 18 };
	const right = { x: c.x + 35, y: c.y };
	return inside(right, bounds) ? right : { x: c.x - 35, y: c.y };
}
