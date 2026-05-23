import { XLINK_NS, XMLNS, svgLine, svgNested, svgPath, svgRect, svgText } from './svgUtils';
import type { ModuleInput, ModuleMode, ModuleOutput, ModuleParam, VisualElement } from '../types';
import { getModuleColor } from '../constants';

export interface ModuleDef {
	id: number;
	shortnm: string;
	height: number;
	colour?: number;
	ve?: VisualElement[];
	modes?: ModuleMode[];
	params?: ModuleParam[];
	inputs?: ModuleInput[];
	outputs?: ModuleOutput[];
}

/**
 * Module instance interface
 */
export interface ModuleInstance {
	type: number;
	horiz: number;
	vert: number;
	colour?: number;
	uname?: string | null;
	lv?: number[];
	modes?: number[];
}

const templateCache = new Map<number, SVGSVGElement>();

/**
 * Clears the module template cache
 */
export function clearTemplateCache(): void {
	templateCache.clear();
}

/**
 * Creates the basic module panel with gradients
 *
 * @param s - SVG element to append to
 * @param h - Height of the panel
 */
export function makeBasicPanel(s: SVGElement, h: number | string): void {
	const h0 = parseInt(String(h)) - 16;
	s.appendChild(svgRect(0, 0, 256, parseInt(String(h)), { fill: 'currentColor' }));
	s.appendChild(
		svgRect(0, 0, 256, 16, {
			fill: 'url(#g119)',
			transform: `translate(0,${h0})`,
		}),
	);
	s.appendChild(svgRect(0, 0, 256, 16, { fill: 'url(#g118)' }));
	s.appendChild(
		svgPath(`M256,0 l0,${parseInt(String(h)) - 1} -4,-4 0,${-(parseInt(String(h)) - 7)}z`, {
			fill: 'url(#g117)',
			stroke: 'none',
		}),
	);
	s.appendChild(
		svgPath(`M0,0 l0,${parseInt(String(h)) - 1} 4,-4 0,${-(parseInt(String(h)) - 7)}z`, {
			fill: 'url(#g116)',
			stroke: 'none',
		}),
	);
}

/**
 * Creates visual sub-elements for a module
 *
 * @param s - SVG element to append to
 * @param o - Module definition object
 */
export function makeSubElements(s: SVGElement, o: ModuleDef): void {
	o.ve?.forEach((n) => {
		switch (n.type) {
			case 'graph':
			case 'graphenv': {
				const x = n.x ?? 0, y = n.y ?? 0, w = n.w ?? 0, h = n.h ?? 0;
				s.appendChild(svgRect(x, y, w, h, { fill: '#088' }));
				if (n.type === 'graph') s.appendChild(svgLine(x, y + h / 2, x + w, y + h / 2, { stroke: '#0DD' }));
				break;
			}
			case 'line':
				s.appendChild(svgLine(n.x1 ?? 0, n.y1 ?? 0, n.x2 ?? 0, n.y2 ?? 0, { stroke: '#333' }));
				break;
			case 'path':
				s.appendChild(svgPath(n.d ?? '', { stroke: '#333', fill: 'none' }));
				break;
			case 'valueDisplay':
				s.appendChild(svgRect(n.x ?? 0, n.y ?? 0, n.w ?? 0, 14, { fill: '#666', 'data-id': n.ref }));
				break;
			case 'led':
			case 'ledArray': {
				const max = n.cnt ?? 1;
				const spc = n.xo ?? 0;
				let x = 2 + (n.x ?? 0);
				for (let i = 0; i < max; i++, x += spc) {
					s.appendChild(svgRect(x, n.y ?? 0, n.w ?? 0, 6.5, { fill: '#040', stroke: '#000' }));
				}
				break;
			}
			case 'bmp': {
				const t = svgNested({ x: n.x ?? 0, y: n.y ?? 0 });
				const u = document.createElementNS(XMLNS, 'use');
				u.setAttributeNS(XLINK_NS, 'xlink:href', `#Bitmap${n.id}`);
				t.appendChild(u);
				s.appendChild(t);
				break;
			}
			case 'text':
				s.appendChild(svgText(n.x ?? 0, n.y ?? 0, n.t ?? '', { fill: 'black' }));
				break;
		}
	});

	o.modes?.forEach((n) => {
		const w = n.w;
		const h = n.h ?? 0;
		if (w) {
			if (w > 0) s.appendChild(svgRect(n.x, n.y, w, h, { stroke: '#222', fill: '#EEE' }));
			const absW = Math.abs(w);
			s.appendChild(svgRect(n.x + absW, n.y, 8, h, { stroke: '#222', fill: '#CCC' }));
			s.appendChild(svgPath(`M${n.x + absW + 1.5},${n.y + (h >> 1) - 1.5} l5,0 -2.5,3z`, { stroke: 'none', fill: '#000' }));
		}
	});

	const colourmap: Record<string, string> = {
		yellow: '#f2f26d',
		orange: '#f2f26d',
		red: '#f26d6d',
		blue: '#6d6df2',
		purple: '#6d6df2',
	};

	o.inputs?.forEach((n) => {
		const t = svgNested({
			fill: colourmap[n.colour],
			x: n.x - 6,
			y: n.y - 5.5,
		});
		const u = document.createElementNS(XMLNS, 'use');
		u.setAttributeNS(XLINK_NS, 'xlink:href', '#input');
		t.appendChild(u);
		s.appendChild(t);
	});

	o.outputs?.forEach((n) => {
		const t = svgNested({
			fill: colourmap[n.colour],
			x: n.x - 6,
			y: n.y - 5.5,
		});
		const u = document.createElementNS(XMLNS, 'use');
		u.setAttributeNS(XLINK_NS, 'xlink:href', '#output');
		t.appendChild(u);
		s.appendChild(t);
	});
}

/**
 * Creates a module template and caches it
 *
 * @param moduleDef - Module definition
 * @param defs - SVG defs element to append to
 * @returns The created template
 */
// function createModuleTemplate(moduleDef: ModuleDef, defs: SVGElement): SVGSVGElement {
// 	const cached = templateCache.get(moduleDef.id);
// 	if (cached) return cached;

// 	const h = moduleDef.height * 16;
// 	const s = document.createElementNS(XMLNS, 'svg');
// 	s.setAttributeNS(null, 'id', moduleDef.shortnm);
// 	makeBasicPanel(s, h);
// 	makeSubElements(s, moduleDef);
// 	defs.appendChild(s);
// 	templateCache.set(moduleDef.id, s);
// 	return s;
// }

/**
 * Removes all modules from an SVG element
 *
 * @param svgElement - SVG element to remove modules from
 */
export function removeAllModules(svgElement: SVGElement): void {
	const toRemove: Element[] = [];
	let sibling = svgElement.firstElementChild;
	while (sibling) {
		const next = sibling.nextElementSibling;
		if (sibling.tagName === 'g' && sibling.classList.contains('module')) {
			toRemove.push(sibling);
		}
		sibling = next;
	}
	toRemove.forEach((mod) => svgElement.removeChild(mod));
}

// Re-export for backwards compatibility
export { getModuleColor };
