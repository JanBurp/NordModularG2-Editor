import { describe, it, expect } from 'vitest';
import { getAllCategories, getModulesByCategory } from '../nmg2mods';
import { filterCategoryModules } from '../moduleSearch';

describe('filterCategoryModules', () => {
	const cat = getAllCategories()[0];
	const mods = getModulesByCategory(cat);
	const first = mods[0];

	it('returns all modules for an empty query', () => {
		expect(filterCategoryModules(cat, '')).toEqual(mods);
	});

	it('single term matching the category name returns the whole category', () => {
		expect(filterCategoryModules(cat, cat.toLowerCase())).toEqual(mods);
	});

	it('single term matches module names', () => {
		const q = first.short.toLowerCase();
		expect(filterCategoryModules(cat, q)).toContain(first);
	});

	it('"group module" filters within the matching category', () => {
		const res = filterCategoryModules(cat, `${cat} ${first.short}`);
		expect(res).toContain(first);
		expect(res.length).toBeLessThanOrEqual(mods.length);
	});

	it('"group " with empty module part returns the whole category', () => {
		expect(filterCategoryModules(cat, `${cat} `)).toEqual(mods);
	});

	it('returns [] when the group part does not match the category', () => {
		expect(filterCategoryModules(cat, `zzzz ${first.short}`)).toEqual([]);
	});
});
