import { getAllCategories, getModulesByCategory } from './nmg2mods';
import type { ModuleDefinition } from '@/types';

const has = (s: string | undefined, q: string) => (s || '').toLowerCase().includes(q);

/** Short-name matches; long-name matches only if nothing in `scope` matches by short name. */
function filterByName(modules: ModuleDefinition[], scope: ModuleDefinition[], q: string): ModuleDefinition[] {
	const field = scope.some((m) => has(m.short, q)) ? 'short' : 'long';
	return modules.filter((m) => has(m[field], q));
}

/** "<group> <term>": the part before the first space selects groups, the rest filters within them. No space: no group part. */
export function parseGroupQuery(query: string): { group: string | null; term: string } {
	const q = query.trimStart().toLowerCase();
	const space = q.indexOf(' ');
	return space < 0 ? { group: null, term: q } : { group: q.slice(0, space), term: q.slice(space + 1).trim() };
}

/**
 * Two-part module search. "<group> <module>": the part before the first space selects
 * the category, the rest filters modules within it ("env " = whole Env group). A single
 * term (no space) matches module names across all categories. Names match on the short
 * name; the long name is only searched when no short name in scope matches.
 */
export function filterCategoryModules(category: string, query: string): ModuleDefinition[] {
	const modules = getModulesByCategory(category);
	const { group, term } = parseGroupQuery(query);
	if (group === null) return term ? filterByName(modules, getAllCategories().flatMap(getModulesByCategory), term) : modules;
	if (!category.toLowerCase().includes(group)) return [];
	return term ? filterByName(modules, modules, term) : modules;
}
