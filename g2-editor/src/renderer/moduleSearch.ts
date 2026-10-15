import { getAllCategories, getModulesByCategory } from './nmg2mods';
import type { ModuleDefinition } from '@/types';

const has = (s: string | undefined, q: string) => (s || '').toLowerCase().includes(q);

/** Short-name matches; long-name matches only if nothing in `scope` matches by short name. */
function filterByName(modules: ModuleDefinition[], scope: ModuleDefinition[], q: string): ModuleDefinition[] {
	const field = scope.some((m) => has(m.short, q)) ? 'short' : 'long';
	return modules.filter((m) => has(m[field], q));
}

/**
 * Two-part module search. "<group> <module>": the part before the first space selects
 * the category, the rest filters modules within it ("env " = whole Env group). A single
 * term (no space) matches module names across all categories. Names match on the short
 * name; the long name is only searched when no short name in scope matches.
 */
export function filterCategoryModules(category: string, query: string): ModuleDefinition[] {
	const modules = getModulesByCategory(category);
	const q = query.trimStart().toLowerCase();
	if (!q) return modules;

	const space = q.indexOf(' ');
	if (space < 0) return filterByName(modules, getAllCategories().flatMap(getModulesByCategory), q);

	const catQuery = q.slice(0, space);
	const modQuery = q.slice(space + 1).trim();
	if (!category.toLowerCase().includes(catQuery)) return [];
	return modQuery ? filterByName(modules, modules, modQuery) : modules;
}
