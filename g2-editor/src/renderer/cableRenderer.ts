/**
 * Cable Renderer for Nord Modular G2
 *
 * Handles rendering of patch cables between modules
 */

import { Patchcord } from './patchcord';
import { svgPath, svgGroup } from './svgUtils';
import { CABLE_SVG_COLORS } from '../constants';
import { getModule } from './nmg2mods';

/**
 * Represents a cable connection
 */
export interface Cable {
	colour: number;
	sourceModule?: number;
	smod?: number;
	destModule?: number;
	dmod?: number;
	sourceJack?: number;
	scon?: number;
	destJack?: number;
	dcon?: number;
	dir?: number;
	[key: string]: any;
}

/**
 * Represents a module
 */
export interface Module {
	index: number;
	type: number;
	horiz: number;
	vert: number;
	[key: string]: any;
}

/**
 * Represents a jack connection point
 */
export interface Jack {
	name: string;
	colour: string;
	x: number;
	y: number;
}

/**
 * Module definition interface
 */
export interface ModuleDef {
	inputs?: Jack[];
	outputs?: Jack[];
	[key: string]: any;
}

/**
 * Renders all patch cables
 *
 * @param modules - Array of modules
 * @param cables - Array of cables to render
 * @param svgElement - SVG element to append cables to
 * @param visibleCables - Optional filter for cable visibility
 */
export interface CableRenderOptions {
	onCableClick?: (cable: Cable) => void;
	selectedCable?: Cable | null;
}

export function makeCableKey(cable: Cable): string {
	return `${cable.smod ?? cable.sourceModule}-${cable.scon ?? cable.sourceJack}-${cable.dmod ?? cable.destModule}-${cable.dcon ?? cable.destJack}`;
}

function isSameCable(a: Cable, b: Cable): boolean {
	return (
		a.smod === b.smod &&
		a.scon === b.scon &&
		a.dmod === b.dmod &&
		a.dcon === b.dcon
	);
}

export function makePatchCables(
	modules: Module[],
	cables: Cable[],
	svgElement: SVGElement,
	options?: CableRenderOptions,
): void {
	cables.forEach((cable) => {
		const sourceModule = cable.sourceModule ?? cable.smod;
		const destModule = cable.destModule ?? cable.dmod;
		const sourceJack = cable.sourceJack ?? cable.scon;
		const destJack = cable.destJack ?? cable.dcon;
		const dir = cable.dir ?? 1;

		const smod = modules.find((m) => m.index == sourceModule);
		const dmod = modules.find((m) => m.index == destModule);

		if (!smod || !dmod) {
			console.warn(
				`Cable skipped: module not found (source=${sourceModule}, dest=${destModule})`,
			);
			return;
		}

		const smodDef = getModule(smod.type) as ModuleDef | undefined;
		const dmodDef = getModule(dmod.type) as ModuleDef | undefined;

		if (!smodDef || !dmodDef) {
			console.warn(
				`Cable skipped: module definition not found (source=${smod.type}, dest=${dmod.type})`,
			);
			return;
		}

		// dir: 1 = output->input, 0 = input->input; dcon is always an input
		const dcon = dmodDef.inputs?.[destJack ?? 0];
		const scon =
			dir === 1
				? smodDef.outputs?.[sourceJack ?? 0]
				: smodDef.inputs?.[sourceJack ?? 0];

		if (!scon || !dcon) {
			console.warn(
				`Cable skipped: jack not found (sourceJack=${sourceJack}, destJack=${destJack}, dir=${dir})`,
			);
			return;
		}

		const sx = scon.x + smod.horiz * 256;
		const sy = scon.y + smod.vert * 16;
		const dx = dcon.x + dmod.horiz * 256;
		const dy = dcon.y + dmod.vert * 16;

		const pc = new Patchcord(sx, sy, dx, dy);
		const d = pc.getCurvePath();
		const color = CABLE_SVG_COLORS[cable.colour] || CABLE_SVG_COLORS[0];

		const isSelected = options?.selectedCable
			? isSameCable(cable, options.selectedCable)
			: false;
		const key = makeCableKey(cable);

		// All three paths share the same data-cable-key so they can be queried/removed together.
		// The border also carries connection data for updateCablePaths().
		const border = svgPath(d, {
			fill: 'none',
			class: `svgcableborder nomouse${isSelected ? ' selected' : ''}`,
			'data-cable-key': key,
			'data-cable-color': String(cable.colour),
			'data-smod': String(smod.index),
			'data-scon': String(sourceJack ?? 0),
			'data-dmod': String(dmod.index),
			'data-dcon': String(destJack ?? 0),
			'data-dir': String(dir),
		});
		const main = svgPath(d, {
			stroke: color,
			fill: 'none',
			class: 'svgcable nomouse',
			'data-cable-key': key,
			'data-cable-color': String(cable.colour),
		});
		const hitArea = svgPath(d, {
			stroke: 'transparent',
			fill: 'none',
			'stroke-width': '12',
			class: 'cable-hit',
			style: 'cursor: pointer',
			'data-cable-key': key,
			'data-cable-color': String(cable.colour),
		});
		if (options?.onCableClick) {
			hitArea.addEventListener('click', (e) => {
				e.stopPropagation();
				options.onCableClick!(cable);
			});
		}
		svgElement.appendChild(border);
		svgElement.appendChild(main);
		svgElement.appendChild(hitArea);
	});
}

/**
 * Removes all three SVG paths (border, main, hit) for a cable identified by key.
 */
export function removeCableByKey(svgElement: SVGElement, key: string): void {
	const toRemove: Element[] = [];
	let el = svgElement.firstElementChild;
	while (el) {
		if (el.getAttribute('data-cable-key') === key) toRemove.push(el);
		el = el.nextElementSibling;
	}
	toRemove.forEach((el) => el.remove());
}

/**
 * Shifts a cubic bezier cable path to new endpoints while preserving the existing curve shape.
 * Path format (from getCurvePath): Mdx dyCcp1x cp1y,cp2x cp2y,sx sy
 * cp1 lives near dst so it shifts by the dst delta; cp2 lives near src so it shifts by the src delta.
 */
function shiftCablePath(
	existingD: string,
	newSx: number,
	newSy: number,
	newDx: number,
	newDy: number,
): string {
	const m = existingD.match(
		/M([-\d.]+) ([-\d.]+)C([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+)/,
	);
	if (!m) return existingD;
	const [oldDx, oldDy, cp1x, cp1y, cp2x, cp2y, oldSx, oldSy] = m
		.slice(1)
		.map(Number);
	const ddx = newDx - oldDx,
		ddy = newDy - oldDy;
	const dsx = newSx - oldSx,
		dsy = newSy - oldSy;
	return `M${newDx} ${newDy}C${cp1x + ddx} ${cp1y + ddy},${cp2x + dsx} ${cp2y + dsy},${newSx} ${newSy}`;
}

/**
 * Re-paths cables whose source or destination module is in movedIds.
 * Cables connected to modules that didn't move are left untouched (preserving their shaken shape).
 * The existing curve shape is preserved — only the endpoints and their nearby control points translate.
 */
export function updateCablePaths(
	modules: Module[],
	svgElement: SVGElement,
	movedIds: Set<number>,
): void {
	if (movedIds.size === 0) return;
	const borders = svgElement.querySelectorAll<SVGPathElement>(
		'.svgcableborder[data-smod]',
	);
	borders.forEach((border) => {
		const smod_i = parseInt(border.getAttribute('data-smod')!);
		const dmod_i = parseInt(border.getAttribute('data-dmod')!);
		if (!movedIds.has(smod_i) && !movedIds.has(dmod_i)) return;

		const scon_i = parseInt(border.getAttribute('data-scon')!);
		const dcon_i = parseInt(border.getAttribute('data-dcon')!);
		const dir = parseInt(border.getAttribute('data-dir') || '1');
		const key = border.getAttribute('data-cable-key')!;

		const smod = modules.find((m) => m.index === smod_i);
		const dmod = modules.find((m) => m.index === dmod_i);
		if (!smod || !dmod) return;

		const smodDef = getModule(smod.type) as ModuleDef | undefined;
		const dmodDef = getModule(dmod.type) as ModuleDef | undefined;
		if (!smodDef || !dmodDef) return;

		const dcon = dmodDef.inputs?.[dcon_i];
		const scon =
			dir === 1 ? smodDef.outputs?.[scon_i] : smodDef.inputs?.[scon_i];
		if (!scon || !dcon) return;

		const newSx = scon.x + smod.horiz * 256;
		const newSy = scon.y + smod.vert * 16;
		const newDx = dcon.x + dmod.horiz * 256;
		const newDy = dcon.y + dmod.vert * 16;

		const d = shiftCablePath(
			border.getAttribute('d') || '',
			newSx,
			newSy,
			newDx,
			newDy,
		);
		svgElement
			.querySelectorAll<SVGPathElement>(`[data-cable-key="${key}"]`)
			.forEach((el) => el.setAttribute('d', d));
	});
}

/**
 * Removes all cables from an SVG element
 *
 * @param svgElement - SVG element to remove cables from
 */
export function removeAllCables(svgElement: SVGElement): void {
	const toRemove: Element[] = [];
	let sibling = svgElement.firstElementChild;
	while (sibling) {
		const next = sibling.nextElementSibling;
		if (
			sibling.tagName === 'path' &&
			(sibling.classList.contains('svgcable') ||
				sibling.classList.contains('svgcableborder') ||
				sibling.classList.contains('cable-hit'))
		) {
			toRemove.push(sibling);
		}
		sibling = next;
	}
	toRemove.forEach((cable) => svgElement.removeChild(cable));
}
