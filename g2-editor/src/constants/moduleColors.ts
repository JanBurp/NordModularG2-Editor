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

/**
 * Module color palette
 * Maps color ID to hex color value
 */
export const MODULE_COLORS: Record<number, string> = {
  0: '#c0c0c0',  // Default gray
  1: '#ccbaba',
  2: '#baccba',
  3: '#b0bacc',
  4: '#d0cbaa',
  5: '#74a0d4',
  6: '#e5777a',
  7: '#7bc1bd',
  8: '#82b980',
  9: '#e7d14b',
  10: '#93d162',
  11: '#dec77d',
  12: '#8f9ac2',
  13: '#ba7d81',
  14: '#ca8d8d',
  15: '#ded1a5',
  16: '#94cf9c',
  17: '#69d6c7',
  18: '#a0d2c8',
  19: '#bed2d2',
  20: '#808cc0',
  21: '#d673c7',
  22: '#be82be',
  23: '#cda0d2',
  24: '#d2bed2'
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
