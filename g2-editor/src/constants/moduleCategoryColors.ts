import { MODULE_CATEGORY_COLORS } from './colors';

export function getCategoryColor(category: string): string {
	return MODULE_CATEGORY_COLORS[category] ?? MODULE_CATEGORY_COLORS.Hidden;
}
