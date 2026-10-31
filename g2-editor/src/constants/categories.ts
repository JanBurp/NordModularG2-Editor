/**
 * Sound category definitions for Nord Modular G2
 *
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
	{ id: 0, name: 'No Cat' },
	{ id: 1, name: 'Acoustic' },
	{ id: 2, name: 'Sequencer' },
	{ id: 3, name: 'Bass' },
	{ id: 4, name: 'Classic' },
	{ id: 5, name: 'Drum' },
	{ id: 6, name: 'Fantasy' },
	{ id: 7, name: 'FX' },
	{ id: 8, name: 'Lead' },
	{ id: 9, name: 'Organ' },
	{ id: 10, name: 'Pad' },
	{ id: 11, name: 'Piano' },
	{ id: 12, name: 'Synth' },
	{ id: 13, name: 'Audio In' },
	{ id: 14, name: 'User 1' },
	{ id: 15, name: 'User 2' },
];

/**
 * Get category name by ID
 * Returns 'Unknown' if ID not found
 */
export function getCategoryName(categoryId: number): string {
	const category = SOUND_CATEGORIES.find((cat) => cat.id === categoryId);
	return category?.name ?? 'Unknown';
}

/**
 * Convert a display name (e.g. "Audio In") to its device slug (e.g. "audio_in")
 */
export function categorySlugFromName(name: string): string {
	return name.toLowerCase().replace(/ /g, '_');
}

const nameBySlug = new Map(SOUND_CATEGORIES.map((c) => [categorySlugFromName(c.name), c.name]));

/**
 * Display name for a device slug (e.g. "audio_in" -> "Audio In"); unknown slugs are returned as-is
 */
export function getCategoryNameFromSlug(slug?: string): string {
	if (!slug) return '';
	return nameBySlug.get(slug) ?? slug;
}

/**
 * Get the device slug for a category ID (used to populate SynthPatch.category)
 */
export function getCategorySlug(categoryId: number): string {
	return categorySlugFromName(SOUND_CATEGORIES[categoryId]?.name ?? SOUND_CATEGORIES[0].name);
}
