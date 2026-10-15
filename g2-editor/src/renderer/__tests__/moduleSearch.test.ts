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

	it('single term matches module names only, not the category name', () => {
		expect(filterCategoryModules('Env', 'env').every((m) => `${m.short} ${m.long}`.toLowerCase().includes('env'))).toBe(true);
	});

	it('single term matches module names across all groups', () => {
		const groups = getAllCategories().filter((c) => filterCategoryModules(c, 'ad').length > 0);
		expect(groups.length).toBeGreaterThan(1);
	});

	it('"env " shows only the Env group with all its modules', () => {
		for (const c of getAllCategories()) {
			expect(filterCategoryModules(c, 'env ')).toEqual(c === 'Env' ? getModulesByCategory('Env') : []);
		}
	});

	it('"env ad" shows only Env modules with "ad" in the name', () => {
		const res = filterCategoryModules('Env', 'env ad');
		expect(res.length).toBeGreaterThan(0);
		expect(res.every((m) => `${m.short} ${m.long}`.toLowerCase().includes('ad'))).toBe(true);
		expect(filterCategoryModules('Filter', 'env ad')).toEqual([]);
	});

	it('extra spaces between group and module are ignored', () => {
		expect(filterCategoryModules('Env', 'env   ad')).toEqual(filterCategoryModules('Env', 'env ad'));
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

	it('matches short names only when any short name matches ("keyboard" → not MonoKey)', () => {
		const names = filterCategoryModules('In/Out', 'keyboard').map((m) => m.short);
		expect(names).toContain('Keyboard');
		expect(names).not.toContain('MonoKey');
	});

	it('falls back to long names when no short name matches', () => {
		expect(filterCategoryModules('In/Out', 'monophonic').map((m) => m.short)).toEqual(['MonoKey']);
	});
});
