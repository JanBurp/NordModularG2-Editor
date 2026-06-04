export const XMLNS = 'http://www.w3.org/2000/svg';
export const XLINK_NS = 'http://www.w3.org/1999/xlink';

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
 * Creates an SVG rectangle
 *
 * @param x - X position
 * @param y - Y position
 * @param width - Width
 * @param height - Height
 * @param attrs - Additional attributes
 * @returns SVG rect element
 */
export function svgRect(x: number, y: number, width: number, height: number, attrs?: Record<string, any>): SVGRectElement {
	return svgNSGet('rect', {
		x,
		y,
		width,
		height,
		...attrs,
	}) as SVGRectElement;
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
 * Creates an SVG line
 *
 * @param x1 - Start X
 * @param y1 - Start Y
 * @param x2 - End X
 * @param y2 - End Y
 * @param attrs - Additional attributes
 * @returns SVG line element
 */
export function svgLine(x1: number, y1: number, x2: number, y2: number, attrs?: Record<string, any>): SVGLineElement {
	return svgNSGet('line', { x1, y1, x2, y2, ...attrs }) as SVGLineElement;
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
 * Creates an SVG text element
 *
 * @param x - X position
 * @param y - Y position
 * @param text - Text content
 * @param attrs - Additional attributes
 * @returns SVG text element
 */
export function svgText(x: number, y: number, text: string, attrs?: Record<string, any>): SVGTextElement {
	return svgNSGet('text', {
		x,
		y,
		textContent: text,
		...attrs,
	}) as SVGTextElement;
}

/**
 * Creates an SVG svg element (nested)
 *
 * @param attrs - Attributes
 * @returns SVG svg element
 */
export function svgNested(attrs?: Record<string, any>): SVGSVGElement {
	return svgNSGet('svg', attrs) as SVGSVGElement;
}
