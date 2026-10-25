import { SOUND_CATEGORIES, categorySlugFromName } from '@/constants/categories';
import { getModuleColor } from '@/constants/moduleColors';

const categoryIndex = new Map(SOUND_CATEGORIES.map((c) => [categorySlugFromName(c.name), c.id]));

// Module colour per category id (No Cat has none). Neighbouring ids get different hues, as the
// "Cat" sort puts them side by side; the purples are kept for User 1 and User 2, and the teals are
// left out (too close to the selection highlight).
const CATEGORY_MODULE_COLORS = [0, 11, 12, 6, 10, 5, 9, 16, 13, 8, 20, 15, 14, 3, 21, 22];

// Opaque category colour (context menu swatches); undefined for No Cat.
export function categoryColor(id: number): string | undefined {
	return CATEGORY_MODULE_COLORS[id] ? getModuleColor(CATEGORY_MODULE_COLORS[id]) : undefined;
}

// Bank Organizer cell/chip background: the category colour, translucent so it works in both themes.
export function categoryTint(category?: string): string | undefined {
	const color = categoryColor(category ? (categoryIndex.get(category) ?? 0) : 0);
	return color && `${color}66`;
}
