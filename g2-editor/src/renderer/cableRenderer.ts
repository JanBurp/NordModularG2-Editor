import { CABLE_SVG_COLORS, CABLE_COLOR_INDEX_MAP, MODULE_WIDTH, MODULE_ROW_HEIGHT } from '../constants';
import { Patchcord } from './patchcord';
import { getModule } from './nmg2mods';
import { svgPath } from './svgUtils';

export interface Cable {
	colour: number;
	userColour?: number; // set only when user explicitly overrides via context menu
	smod: number;
	scon: number;
	dmod: number;
	dcon: number;
	dir?: number;
}

export interface Module {
	index: number;
	type: number;
	horiz: number;
	vert: number;
}

export interface Jack {
	name: string;
	colour: string;
	x: number;
	y: number;
}

export interface CableRenderOptions {
	onCableClick?: (cable: Cable) => void;
	onCableGrabStart?: (e: MouseEvent, cable: Cable) => void;
	selectedCables?: Cable[];
	gravity?: number;
	opacity?: number;
	thickness?: number;
}

export function makeCableKey(cable: Cable): string {
	return `${cable.smod}-${cable.scon}-${cable.dmod}-${cable.dcon}`;
}

export function makePatchCables(modules: Module[], cables: Cable[], svgElement: SVGElement, options?: CableRenderOptions): void {
	const modulesByIndex = new Map(modules.map((m) => [m.index, m]));
	const selectedKeys = new Set(options?.selectedCables?.map(makeCableKey) ?? []);
	const mainStroke = 1 + (options?.thickness ?? 1) * 1.5;
	const borderStroke = mainStroke + 2 + (options?.thickness ?? 1) * 0.3;
	const opacity = (options?.opacity ?? 90) / 100;
	const gravity = options?.gravity ?? 50;
	cables.forEach((cable) => {
		const dir = cable.dir ?? 1;

		const smod = modulesByIndex.get(cable.smod);
		const dmod = modulesByIndex.get(cable.dmod);

		if (!smod || !dmod) {
			console.warn(`Cable skipped: module not found (source=${cable.smod}, dest=${cable.dmod})`);
			return;
		}

		const smodDef = getModule(smod.type);
		const dmodDef = getModule(dmod.type);

		if (!smodDef || !dmodDef) {
			console.warn(`Cable skipped: module definition not found (source=${smod.type}, dest=${dmod.type})`);
			return;
		}

		// dir: 1 = output->input, 0 = input->input; dcon is always an input
		const dcon = dmodDef.inputs?.[cable.dcon];
		const scon = dir === 1 ? smodDef.outputs?.[cable.scon] : smodDef.inputs?.[cable.scon];

		if (!scon || !dcon) {
			console.warn(`Cable skipped: jack not found (scon=${cable.scon}, dcon=${cable.dcon}, dir=${dir})`);
			return;
		}

		const sx = scon.x + smod.horiz * MODULE_WIDTH;
		const sy = scon.y + smod.vert * MODULE_ROW_HEIGHT;
		const dx = dcon.x + dmod.horiz * MODULE_WIDTH;
		const dy = dcon.y + dmod.vert * MODULE_ROW_HEIGHT;

		const pc = new Patchcord(sx, sy, dx, dy);
		const d = pc.getCurvePath(gravity);
		const color = CABLE_SVG_COLORS[cable.colour] ?? CABLE_SVG_COLORS[0];

		const isSelected = selectedKeys.has(makeCableKey(cable));
		const key = makeCableKey(cable);

		// All three paths share the same data-cable-key so they can be queried/removed together.
		// The border also carries connection data for updateCablePaths().
		const border = svgPath(d, {
			fill: 'none',
			class: `svgcableborder nomouse${isSelected ? ' selected' : ''}`,
			'data-cable-key': key,
			'data-cable-color': String(cable.colour),
			'data-smod': String(smod.index),
			'data-scon': String(cable.scon),
			'data-dmod': String(dmod.index),
			'data-dcon': String(cable.dcon),
			'data-dir': String(dir),
			style: `stroke-width: ${borderStroke};`,
		});

		const main = svgPath(d, {
			stroke: color,
			fill: 'none',
			class: 'svgcable nomouse',
			'data-cable-key': key,
			'data-cable-color': String(cable.colour),
			style: `stroke-width: ${mainStroke}; opacity: ${opacity};`,
		});
		const hitArea = svgPath(d, {
			stroke: 'transparent',
			fill: 'none',
			'stroke-width': '12',
			class: 'cable-hit nomouse',
			'data-cable-key': key,
			'data-cable-color': String(cable.colour),
		});
		if (options?.onCableGrabStart) {
			hitArea.addEventListener('mousedown', (e) => options.onCableGrabStart!(e, cable));
		}

		svgElement.appendChild(border);
		svgElement.appendChild(main);
		svgElement.appendChild(hitArea);
	});
}

export function removeCableByKey(svgElement: SVGElement, key: string): void {
	svgElement.querySelectorAll(`[data-cable-key="${key}"]`).forEach((el) => el.remove());
}

// Applies the color-filter visibility to one cable element (ignoring any hover-reveal override).
export function applyVisibilityToElement(el: Element, visibility: Record<string, boolean>): void {
	const colorName = CABLE_COLOR_INDEX_MAP[parseInt(el.getAttribute('data-cable-color') || '0')];
	if (colorName) el.classList.toggle('cable-hidden', visibility[colorName] === false);
}

// Applies CSS cable-hidden class based on per-color visibility flags.
// forceVisibleKeys overrides the color filter for specific cables (e.g. temporarily revealed on jack hover).
export function applyCableVisibility(svgElement: SVGElement, visibility: Record<string, boolean>, forceVisibleKeys?: Set<string>): void {
	svgElement.querySelectorAll<Element>('[data-cable-color]').forEach((el) => {
		if (forceVisibleKeys?.has(el.getAttribute('data-cable-key') || '')) {
			el.classList.remove('cable-hidden');
			return;
		}
		applyVisibilityToElement(el, visibility);
	});
}

// Parses a bezier cable path "M dx dy C cp1x cp1y,cp2x cp2y,sx sy" into its 8 numbers, or null.
type CablePathPoints = [number, number, number, number, number, number, number, number];
function parseCablePath(d: string): CablePathPoints | null {
	const m = d.match(/M([-\d.]+) ([-\d.]+)C([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+)/);
	if (!m) return null;
	return m.slice(1).map(Number) as CablePathPoints;
}

// Shifts one endpoint of a bezier cable path to a new position while preserving the curve's shape.
// end='dst' moves the path's "M" point (cable.dmod/dcon); end='src' moves the path's final point
// (cable.smod/scon). The adjacent control point (cp1 near dst, cp2 near src) moves with its endpoint.
export function shiftCableEndpoint(existingD: string, end: 'src' | 'dst', newX: number, newY: number): string {
	const p = parseCablePath(existingD);
	if (!p) return existingD;
	const [dx, dy, cp1x, cp1y, cp2x, cp2y, sx, sy] = p;
	if (end === 'dst') {
		const ddx = newX - dx,
			ddy = newY - dy;
		return `M${newX} ${newY}C${cp1x + ddx} ${cp1y + ddy},${cp2x} ${cp2y},${sx} ${sy}`;
	}
	const dsx = newX - sx,
		dsy = newY - sy;
	return `M${dx} ${dy}C${cp1x} ${cp1y},${cp2x + dsx} ${cp2y + dsy},${newX} ${newY}`;
}

// Shifts a bezier cable path to new endpoints while preserving the existing curve shape.
function shiftCablePath(existingD: string, newSx: number, newSy: number, newDx: number, newDy: number): string {
	return shiftCableEndpoint(shiftCableEndpoint(existingD, 'dst', newDx, newDy), 'src', newSx, newSy);
}

// Re-paths cables whose source or destination module is in movedIds, preserving curve shape.
export function updateCablePaths(modules: Module[], svgElement: SVGElement, movedIds: Set<number>): void {
	if (movedIds.size === 0) return;
	const modulesByIndex = new Map(modules.map((m) => [m.index, m]));
	const borders = svgElement.querySelectorAll<SVGPathElement>('.svgcableborder[data-smod]');
	borders.forEach((border) => {
		const smod_i = parseInt(border.getAttribute('data-smod')!);
		const dmod_i = parseInt(border.getAttribute('data-dmod')!);
		if (!movedIds.has(smod_i) && !movedIds.has(dmod_i)) return;

		const scon_i = parseInt(border.getAttribute('data-scon')!);
		const dcon_i = parseInt(border.getAttribute('data-dcon')!);
		const dir = parseInt(border.getAttribute('data-dir') || '1');
		const key = border.getAttribute('data-cable-key')!;

		const smod = modulesByIndex.get(smod_i);
		const dmod = modulesByIndex.get(dmod_i);
		if (!smod || !dmod) return;

		const smodDef = getModule(smod.type);
		const dmodDef = getModule(dmod.type);
		if (!smodDef || !dmodDef) return;

		const dcon = dmodDef.inputs?.[dcon_i];
		const scon = dir === 1 ? smodDef.outputs?.[scon_i] : smodDef.inputs?.[scon_i];
		if (!scon || !dcon) return;

		const newSx = scon.x + smod.horiz * MODULE_WIDTH;
		const newSy = scon.y + smod.vert * MODULE_ROW_HEIGHT;
		const newDx = dcon.x + dmod.horiz * MODULE_WIDTH;
		const newDy = dcon.y + dmod.vert * MODULE_ROW_HEIGHT;

		const d = shiftCablePath(border.getAttribute('d') || '', newSx, newSy, newDx, newDy);
		svgElement.querySelectorAll<SVGPathElement>(`[data-cable-key="${key}"]`).forEach((el) => el.setAttribute('d', d));
	});
}

export function removeAllCables(svgElement: SVGElement): void {
	svgElement.querySelectorAll('.svgcable, .svgcableborder, .cable-hit').forEach((el) => el.remove());
}

// Updates opacity and stroke-width on existing cable elements without re-rendering.
export function updateCableStyles(svgElement: SVGElement, opacity: number, thickness: number): void {
	const mainStroke = 1 + thickness * 1.5;
	const borderStroke = mainStroke + 2 + thickness * 0.3;
	const o = opacity / 100;
	svgElement.querySelectorAll<SVGPathElement>('.svgcable').forEach((el) => {
		el.setAttribute('style', `stroke-width: ${mainStroke}; opacity: ${o};`);
	});
	svgElement.querySelectorAll<SVGPathElement>('.svgcableborder').forEach((el) => {
		el.setAttribute('style', `stroke-width: ${borderStroke};`);
	});
}

// Shifts control point y-coordinates on all cable paths by the delta between old and new gravity,
// preserving the random organic shape and only changing the downward droop.
export function updateCableGravity(svgElement: SVGElement, oldGravity: number, newGravity: number): void {
	svgElement.querySelectorAll<SVGPathElement>('[data-cable-key]').forEach((el) => {
		const d = el.getAttribute('d');
		if (!d) return;
		const p = parseCablePath(d);
		if (!p) return;
		const [dx, dy, cp1x, cp1y, cp2x, cp2y, sx, sy] = p;
		const diffX = sx - dx,
			diffY = sy - dy;
		const length = Math.sqrt(diffX * diffX + diffY * diffY);
		const base = Math.max(sy, dy) - (sy + dy) / 2 + length * 0.2;
		const delta = ((newGravity - oldGravity) / 100) * base * (4 / 3);
		el.setAttribute('d', `M${dx} ${dy}C${cp1x} ${cp1y + delta},${cp2x} ${cp2y + delta},${sx} ${sy}`);
	});
}
