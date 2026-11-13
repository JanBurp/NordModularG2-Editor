/**
 * Module panel color definitions for Nord Modular G2
 *
 * The G2 has 25 different module colors (0-24)
 * Each color is used for the module panel background
 */

import { MODULE_COLORS } from './colors';

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
