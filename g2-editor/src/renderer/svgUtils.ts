const XMLNS = 'http://www.w3.org/2000/svg';

function svgNSGet(tag: string | SVGElement, attrs?: Record<string, any>): SVGElement {
	const se = typeof tag === 'object' ? tag : document.createElementNS(XMLNS, tag);
	if (attrs) {
		for (const a in attrs) {
			if (a === 'innerHTML' || a === 'textContent') {
				(se as any)[a] = attrs[a];
			} else {
				se.setAttributeNS(null, a, attrs[a]);
			}
		}
	}
	return se;
}

/**
 * Creates an SVG circle
 *
 * @param cx - Center X
 * @param cy - Center Y
 * @param r - Radius
 * @param attrs - Additional attributes
 * @returns SVG circle element
 */
export function svgCircle(cx: number, cy: number, r: number, attrs?: Record<string, any>): SVGCircleElement {
	return svgNSGet('circle', { cx, cy, r, ...attrs }) as SVGCircleElement;
}

/**
 * Creates an SVG path
 *
 * @param d - Path data string
 * @param attrs - Additional attributes
 * @returns SVG path element
 */
export function svgPath(d: string, attrs?: Record<string, any>): SVGPathElement {
	return svgNSGet('path', { d, ...attrs }) as SVGPathElement;
}

/**
 * Transforms viewport (client) coordinates into the SVG's user-space coordinates.
 * Returns null if the element is missing or has no current transform matrix.
 */
export function clientToSvgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } | null {
	if (!svg?.getScreenCTM) return null;
	const ctm = svg.getScreenCTM();
	if (!ctm) return null;
	const pt = svg.createSVGPoint();
	pt.x = clientX;
	pt.y = clientY;
	return pt.matrixTransform(ctm.inverse());
}
