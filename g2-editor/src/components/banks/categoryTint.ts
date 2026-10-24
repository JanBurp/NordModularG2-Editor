import { SOUND_CATEGORIES, categorySlugFromName } from '@/constants/categories';

const categoryIndex = new Map(SOUND_CATEGORIES.map((c) => [categorySlugFromName(c.name), c.id]));

// Bank Organizer cell/chip background: one hue per category (No Cat stays untinted),
// translucent so it works in both themes.
export function categoryTint(category?: string): string | undefined {
	const id = category ? (categoryIndex.get(category) ?? 0) : 0;
	return id ? `hsl(${Math.round(((id - 1) * 360) / 15)} 55% 50% / 0.22)` : undefined;
}
