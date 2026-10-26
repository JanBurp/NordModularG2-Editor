import { describe, expect, it } from 'vitest';
import { getAllModules } from '@/renderer/nmg2mods';
import { MORPH_NAMES, type Patch } from '@/types/patch';
import { buildMatcher, collectItems, computeReplacements, findMatches, splitMatches, type SearchItem } from '../searchReplace';

const labelled = getAllModules().find((m) => (m.params ?? []).some((p) => p.label?.length === 4))!;
const labelParam = labelled.params!.findIndex((p) => p.label?.length === 4);
const plain = getAllModules().find((m) => !(m.params ?? []).some((p) => p.label))!;

function makePatch(): Patch {
	return {
		areas: [
			{ modules: [{ index: 3, type: plain.id, horiz: 0, vert: 0, uname: 'FxOsc' }] },
			{
				modules: [
					{ index: 2, type: plain.id, horiz: 1, vert: 0, uname: 'Osc B' },
					{
						index: 1,
						type: labelled.id,
						horiz: 0,
						vert: 5,
						paramLabels: [{ paramIndex: labelParam, isString: true, paramLen: 29, labels: ['Mic'] }],
					},
				],
			},
		],
		morphParamLabels: [{ paramIndex: 9, isString: true, paramLen: 8, labels: ['OscMod'] }],
	} as unknown as Patch;
}

const re = (term: string, caseSensitive = false, regex = false) => buildMatcher(term, { caseSensitive, regex }) as RegExp;
const texts = (items: SearchItem[]) => items.map((i) => i.text);

describe('buildMatcher', () => {
	it('returns null for an empty term and an error for an invalid regex', () => {
		expect(buildMatcher('', { caseSensitive: false, regex: false })).toBeNull();
		expect(buildMatcher('(', { caseSensitive: false, regex: true })).toHaveProperty('error');
	});

	it('escapes regex characters in literal mode', () => {
		expect(re('.').test('a')).toBe(false);
		expect(re('.', false, true).test('a')).toBe(true);
	});
});

describe('collectItems', () => {
	it('lists VA (by column, then row), then FX, then all 8 morph groups', () => {
		const items = collectItems(makePatch());
		expect(items[0]).toMatchObject({ kind: 'module', area: 'voice', moduleIndex: 1, text: labelled.short });
		expect(items.find((i) => i.kind === 'module' && i.area === 'fx')).toMatchObject({ moduleIndex: 3, text: 'FxOsc' });
		expect(texts(items.filter((i) => i.kind === 'morph'))).toEqual([MORPH_NAMES[0], 'OscMod', ...MORPH_NAMES.slice(2)]);
	});

	it('lists only renamable params, custom label first, else the default name', () => {
		const params = collectItems(makePatch()).filter((i) => i.kind === 'param' && i.paramIndex === labelParam);
		expect(texts(params)).toEqual(['Mic', ...labelled.params![labelParam].label!.slice(1)]);
	});
});

describe('findMatches', () => {
	it('honours case sensitivity', () => {
		const items = collectItems(makePatch());
		expect(texts(findMatches(items, re('osc')))).toEqual(['Osc B', 'FxOsc', 'OscMod']);
		expect(texts(findMatches(items, re('osc', true)))).toEqual([]);
	});
});

describe('computeReplacements', () => {
	it('replaces every occurrence, with $1 groups in regex mode', () => {
		const items = findMatches(collectItems(makePatch()), re('Osc (\\w)', true, true));
		const { changes } = computeReplacements(items, re('Osc (\\w)', true, true), 'Vco-$1');
		expect(changes).toEqual([{ kind: 'module', area: 'voice', moduleIndex: 2, text: 'Vco-B' }]);
	});

	it('skips too long, empty module names and non-ASCII, and leaves unchanged items out', () => {
		const items: SearchItem[] = [
			{ kind: 'module', area: 'voice', moduleIndex: 1, text: 'Osc' },
			{ kind: 'param', area: 'voice', moduleIndex: 1, paramIndex: 0, labelIndex: 0, text: 'Osc' },
			{ kind: 'morph', groupIndex: 0, text: 'Osc' },
		];
		expect(computeReplacements(items, re('Osc'), '').skipped.map((s) => s.reason)).toEqual(['empty name']);
		expect(computeReplacements(items, re('Osc'), 'Oscillator').skipped.map((s) => s.item.kind)).toEqual(['param', 'morph']);
		expect(computeReplacements(items, re('Osc'), 'Ösc').skipped.map((s) => s.reason)).toEqual(['non-ASCII', 'non-ASCII', 'non-ASCII']);
		expect(computeReplacements(items, re('Osc'), 'Osc').changes).toEqual([]);
	});
});

describe('splitMatches', () => {
	it('marks every found run, ignoring zero-length regex matches', () => {
		expect(splitMatches('OscOsc B', re('osc'))).toEqual([
			{ text: 'Osc', hit: true },
			{ text: 'Osc', hit: true },
			{ text: ' B', hit: false },
		]);
		expect(splitMatches('Osc', re('x*', false, true))).toEqual([{ text: 'Osc', hit: false }]);
	});
});
