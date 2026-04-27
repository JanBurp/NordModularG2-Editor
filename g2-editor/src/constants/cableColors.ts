/**
 * Cable color definitions for Nord Modular G2
 */

export interface CableColor {
	name: string;
	label: string;
	hex: string;
}

export type CableColorName =
	| "red"
	| "blue"
	| "yellow"
	| "orange"
	| "green"
	| "purple"
	| "white";

/**
 * Cable color definitions with display names and hex values
 */
export const CABLE_COLORS: CableColor[] = [
	{ name: "red", label: "Red", hex: "#e74c3c" },
	{ name: "blue", label: "Blue", hex: "#3498db" },
	{ name: "yellow", label: "Yellow", hex: "#f1c40f" },
	{ name: "orange", label: "Orange", hex: "#e67e22" },
	{ name: "green", label: "Green", hex: "#2ecc71" },
	{ name: "purple", label: "Purple", hex: "#9b59b6" },
	{ name: "white", label: "White", hex: "#ecf0f1" },
];

/**
 * Mapping from numeric cable color index to color name
 * Used when filtering cables based on visibility
 */
export const CABLE_COLOR_INDEX_MAP: Record<number, CableColorName> = {
	0: "red",
	1: "blue",
	2: "yellow",
	3: "orange",
	4: "green",
	5: "purple",
	6: "white",
};

/**
 * SVG stroke colors used in svgRenderer.js
 */
export const CABLE_SVG_COLORS: Record<number, string> = {
	0: "#f26d6d", // Red
	1: "#6d9cf2", // Blue
	2: "#f2f26d", // Yellow
	3: "#f2a26d", // Orange
	4: "#6df26d", // Green
	5: "#d26df2", // Purple
	6: "#ffffff", // White
};

/**
 * Default visibility state for all cable colors
 */
export const DEFAULT_CABLE_VISIBILITY: Record<CableColorName, boolean> = {
	red: true,
	blue: true,
	yellow: true,
	orange: true,
	green: true,
	purple: true,
	white: true,
};

/**
 * Jack colors for input/output connectors
 */
export const JACK_COLORS: Record<string, string> = {
	blue: "#6d6df2",
	red: "#f26d6d",
	yellow: "#f2f26d",
	orange: "#f2f26d", // orange: "#f2a26d",
	green: "#6df26d",
	purple: "#6d6df2", // purple: "#d26df2",
	white: "#e0e0e0",
};
