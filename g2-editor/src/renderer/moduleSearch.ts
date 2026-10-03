import { getModulesByCategory } from './nmg2mods';
import type { ModuleDefinition } from '@/types';

const nameMatches = (m: ModuleDefinition, q: string) => (m.short || '').toLowerCase().includes(q) || (m.long || '').toLowerCase().includes(q);

/**
 * Two-part module search. "<group> <module>": the first part selects the category,
 * the second filters modules within it. A single term matches module names, or a
 * whole category when the category name matches.
 */
export function filterCategoryModules(category: string, query: string): ModuleDefinition[] {
	const modules = getModulesByCategory(category);
	const q = query.trim().toLowerCase();
	if (!q) return modules;

	const categoryMatches = (term: string) => category.toLowerCase().includes(term);

	if (q.includes(' ')) {
		const [catQuery, modQuery] = q.split(' ');
		if (!categoryMatches(catQuery)) return [];
		return modQuery ? modules.filter((m) => nameMatches(m, modQuery)) : modules;
	}

	return categoryMatches(q) ? modules : modules.filter((m) => nameMatches(m, q));
}
