/**
 * Module panel color definitions for Nord Modular G2
 *
 * The G2 has 25 different module colors (0-24)
 * Each color is used for the module panel background
 */

export interface ModuleColor {
	id: number;
	name: string;
	hex: string;
}

export const MODULE_COLORS_ORDER: Record<number, number> = {
	0: 0,
	1: 6,
	2: 13,
	3: 14,
	4: 1,
	5: 9,
	6: 11,
	7: 15,
	8: 4,
	9: 10,
	10: 8,
	11: 16,
	12: 2,
	13: 17,
	14: 7,
	15: 18,
	16: 19,
	17: 5,
	18: 20,
	19: 12,
	20: 3,
	21: 21,
	22: 22,
	23: 23,
	24: 24,
};


/**
 * Module color palette
 * Maps color ID to hex color value
 */
export const MODULE_COLORS: Record<number, string> = {
	0: "#c0c0c0",	// Default gray
	6: "#e5777a", 13: "#ba7d81", 14: "#ca8d8d", 1: "#ccbaba",
	9: "#e7d14b", 11: "#dec77d", 15: "#ded1a5", 4: "#d0cbaa",
	10: "#93d162", 8: "#82b980", 16: "#94cf9c", 2: "#baccba",
	17: "#69d6c7", 7: "#7bc1bd", 18: "#a0d2c8", 19: "#bed2d2",
	5: "#74a0d4", 20: "#808cc0", 12: "#8f9ac2", 3: "#b0bacc",
	21: "#d673c7", 22: "#be82be", 23: "#cda0d2", 24: "#d2bed2"
};


/**
 * Default module color (color 0)
 */
export const DEFAULT_MODULE_COLOR = MODULE_COLORS[0];

/**
 * Get module color by ID
 * Returns default color if ID not found
 */
export function getModuleColor(colorId: number): string {
	return MODULE_COLORS[colorId] ?? DEFAULT_MODULE_COLOR;
}
