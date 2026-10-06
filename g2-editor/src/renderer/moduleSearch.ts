import { getModulesByCategory } from './nmg2mods';
import type { ModuleDefinition } from '@/types';

const nameMatches = (m: ModuleDefinition, q: string) => (m.short || '').toLowerCase().includes(q) || (m.long || '').toLowerCase().includes(q);

/**
 * Two-part module search. "<group> <module>": the part before the first space selects
 * the category, the rest filters modules within it ("env " = whole Env group). A single
 * term (no space) matches module names across all categories.
 */
export function filterCategoryModules(category: string, query: string): ModuleDefinition[] {
	const modules = getModulesByCategory(category);
	const q = query.trimStart().toLowerCase();
	if (!q) return modules;

	const space = q.indexOf(' ');
	if (space < 0) return modules.filter((m) => nameMatches(m, q));

	const catQuery = q.slice(0, space);
	const modQuery = q.slice(space + 1).trim();
	if (!category.toLowerCase().includes(catQuery)) return [];
	return modQuery ? modules.filter((m) => nameMatches(m, modQuery)) : modules;
}
