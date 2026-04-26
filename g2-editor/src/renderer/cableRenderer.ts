/**
 * Cable Renderer for Nord Modular G2
 *
 * Handles rendering of patch cables between modules
 */

import { Patchcord } from "./patchcord";
import { svgPath, svgGroup } from "./svgUtils";
import { CABLE_SVG_COLORS } from "../constants";
import { getModule } from "./nmg2mods";

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

function isSameCable(a: Cable, b: Cable): boolean {
	return a.smod === b.smod && a.scon === b.scon && a.dmod === b.dmod && a.dcon === b.dcon;
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

		// Look up module definitions to get inputs/outputs
		const smodDef = getModule(smod.type) as
			| ModuleDef
			| undefined;
		const dmodDef = getModule(dmod.type) as
			| ModuleDef
			| undefined;

		if (!smodDef || !dmodDef) {
			console.warn(
				`Cable skipped: module definition not found (source=${smod.type}, dest=${dmod.type})`,
			);
			return;
		}

		// dir: 1 = output->input, 0 = input->input
		// Note: dcon (destination) is ALWAYS an input jack
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

		// Calculate positions
		const sx = scon.x + smod.horiz * 256;
		const sy = scon.y + smod.vert * 16;
		const dx = dcon.x + dmod.horiz * 256;
		const dy = dcon.y + dmod.vert * 16;

		const pc = new Patchcord(sx, sy, dx, dy);
		const d = pc.getCurvePath();
		const color = CABLE_SVG_COLORS[cable.colour] || CABLE_SVG_COLORS[0];

		const isSelected = options?.selectedCable ? isSameCable(cable, options.selectedCable) : false;
		const cableKey = `${cable.smod ?? cable.sourceModule}-${cable.scon ?? cable.sourceJack}-${cable.dmod ?? cable.destModule}-${cable.dcon ?? cable.destJack}`;

		// Create 2-layer cable: border -> main
		const border = svgPath(d, {
			fill: "none",
			class: `svgcableborder nomouse${isSelected ? " selected" : ""}`,
			"data-cable-key": cableKey,
		});
		const main = svgPath(d, {
			stroke: color,
			fill: "none",
			class: "svgcable nomouse",
		});
		// Transparent wide hit area for clicking
		const hitArea = svgPath(d, {
			stroke: "transparent",
			fill: "none",
			"stroke-width": "12",
			class: "cable-hit",
			style: "cursor: pointer",
		});
		if (options?.onCableClick) {
			hitArea.addEventListener("click", (e) => {
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
			sibling.tagName === "path" &&
			(sibling.classList.contains("svgcable") ||
				sibling.classList.contains("svgcableborder") ||
				sibling.classList.contains("cable-hit"))
		) {
			toRemove.push(sibling);
		}
		sibling = next;
	}
	toRemove.forEach((cable) => svgElement.removeChild(cable));
}
