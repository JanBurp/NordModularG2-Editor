/**
 * Sound category definitions for Nord Modular G2
 *
 * Based on the official g2ools categories.py
 * Categories are stored as 8-bit values in patch data (0-15)
 */

export interface SoundCategory {
	id: number;
	name: string;
}

/**
 * All sound categories for the Nord Modular G2
 */
export const SOUND_CATEGORIES: SoundCategory[] = [
	{ id: 0, name: "No Cat" },
	{ id: 1, name: "Acoustic" },
	{ id: 2, name: "Sequencer" },
	{ id: 3, name: "Bass" },
	{ id: 4, name: "Classic" },
	{ id: 5, name: "Drum" },
	{ id: 6, name: "Fantasy" },
	{ id: 7, name: "FX" },
	{ id: 8, name: "Lead" },
	{ id: 9, name: "Organ" },
	{ id: 10, name: "Pad" },
	{ id: 11, name: "Piano" },
	{ id: 12, name: "Synth" },
	{ id: 13, name: "Audio In" },
	{ id: 14, name: "User 1" },
	{ id: 15, name: "User 2" },
];

/**
 * Number of sound categories
 */
export const CATEGORY_COUNT = SOUND_CATEGORIES.length;

/**
 * Default category (No Cat)
 */
export const DEFAULT_CATEGORY_ID = 0;

/**
 * Get category name by ID
 * Returns 'Unknown' if ID not found
 */
export function getCategoryName(categoryId: number): string {
	const category = SOUND_CATEGORIES.find((cat) => cat.id === categoryId);
	return category?.name ?? "Unknown";
}

/**
 * Validate category ID
 * Returns true if the ID is valid (0-15)
 */
export function isValidCategoryId(categoryId: number): boolean {
	return categoryId >= 0 && categoryId < CATEGORY_COUNT;
}
