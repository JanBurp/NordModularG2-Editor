/**
 * Cable color definitions for Nord Modular G2
 */

export interface CableColor {
	name: string;
	label: string;
	hex: string;
}

export type CableColorName = 'red' | 'blue' | 'yellow' | 'orange' | 'green' | 'purple' | 'white';

/**
 * Mapping from numeric cable color index to color name
 * Used when filtering cables based on visibility
 */
export const CABLE_COLOR_INDEX_MAP: Record<number, CableColorName> = {
	0: 'red',
	1: 'blue',
	2: 'yellow',
	3: 'orange',
	4: 'green',
	5: 'purple',
	6: 'white',
};

/**
 * Returns the effective jack colour accounting for module uprate.
 * Module defs encode the original editor's per-connector Bandwidth flag in the colour name:
 * "purple" (Dynamic control) and "orange" (Dynamic logic) follow the module's uprate state,
 * red/blue/yellow are Static and never change (cf. CPnl{Control,Logic}Hole::GetColor in G2Editor.c).
 * Dynamic: purple → blue, or red when uprated; orange → yellow, or orange when uprated.
 */
export function getEffectiveJackColor(defaultColour: string, uprated: boolean): string {
	if (defaultColour === 'purple') return uprated ? 'red' : 'blue';
	if (defaultColour === 'orange') return uprated ? 'orange' : 'yellow';
	return defaultColour;
}

/**
 * Maps a colour name (e.g. "red", "blue") to its numeric cable index (0-6).
 * Falls back to 1 (blue) for unknown names.
 */
export function jackColorNameToIndex(name: string): number {
	const entry = Object.entries(CABLE_COLOR_INDEX_MAP).find(([, n]) => n === name);
	return entry ? Number(entry[0]) : 1;
}
