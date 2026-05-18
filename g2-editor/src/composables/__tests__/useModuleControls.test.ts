import { describe, expect, it } from 'vitest';
import { parseDefin, calcDefinOptions, applyDefinReplacements, definReplacements } from '../../utils/moduleControls';

describe('parseDefin', () => {
	it('parses simple string labels', () => {
		const result = parseDefin(['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg']);
		expect(result).toEqual([
			{ numVal: 0, label: 'Pos' },
			{ numVal: 1, label: 'PosInv' },
			{ numVal: 2, label: 'Neg' },
		]);
	});

	it('parses defin with {+-} prefix', () => {
		const result = parseDefin(['0 ~ {+-}0, 1 ~ {+-}0.5, 64 ~ {+-}32']);
		expect(result).toEqual([
			{ numVal: 0, label: '{+-}0' },
			{ numVal: 1, label: '{+-}0.5' },
			{ numVal: 64, label: '{+-}32' },
		]);
	});

	it('sorts by numeric value ascending', () => {
		const result = parseDefin(['64 ~ middle, 0 ~ start, 127 ~ end']);
		expect(result[0]).toEqual({ numVal: 0, label: 'start' });
		expect(result[1]).toEqual({ numVal: 64, label: 'middle' });
		expect(result[2]).toEqual({ numVal: 127, label: 'end' });
	});

	it('returns empty array for empty defin', () => {
		expect(parseDefin([])).toEqual([]);
	});
});

describe('parseDefin interpolation cases', () => {
	it('handles {+-} prefixed interpolation defin', () => {
		const options = parseDefin(['0 ~ {+-}0, 1 ~ {+-}0.5, 64 ~ {+-}32, 126 ~ {+-}63.0, 127 ~ {+-}64.0']);
		expect(options).toEqual([
			{ numVal: 0, label: '{+-}0' },
			{ numVal: 1, label: '{+-}0.5' },
			{ numVal: 64, label: '{+-}32' },
			{ numVal: 126, label: '{+-}63.0' },
			{ numVal: 127, label: '{+-}64.0' },
		]);
	});

	it('handles string-only defin without interpolation', () => {
		const options = parseDefin(['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg, 3 ~ NegInv, 4 ~ Bip, 5 ~ BipInv']);
		expect(options).toEqual([
			{ numVal: 0, label: 'Pos' },
			{ numVal: 1, label: 'PosInv' },
			{ numVal: 2, label: 'Neg' },
			{ numVal: 3, label: 'NegInv' },
			{ numVal: 4, label: 'Bip' },
			{ numVal: 5, label: 'BipInv' },
		]);
	});

	it('handles mixed string and numeric labels defin', () => {
		const options = parseDefin(['0 ~ Off, 1 ~ 1, 127 ~ 127']);
		expect(options).toEqual([
			{ numVal: 0, label: 'Off' },
			{ numVal: 1, label: '1' },
			{ numVal: 127, label: '127' },
		]);
	});
});

describe('calcDefinOptions', () => {
	const plusMinusOptions = parseDefin(['0 ~ {+-}0, 1 ~ {+-}0.5, 64 ~ {+-}32, 126 ~ {+-}63.0, 127 ~ {+-}64.0']);
	const stringOptions = parseDefin(['0 ~ Pos, 1 ~ PosInv, 2 ~ Neg, 3 ~ NegInv, 4 ~ Bip, 5 ~ BipInv']);
	const mixedOptions = parseDefin(['0 ~ Off, 1 ~ 1, 127 ~ 127']);

	describe('exact matches', () => {
		it('returns label for exact match at start', () => {
			expect(calcDefinOptions(0, plusMinusOptions)).toBe('±0');
		});

		it('returns label for exact match at second option', () => {
			expect(calcDefinOptions(1, plusMinusOptions)).toBe('±0.5');
		});

		it('returns label for exact match at middle option', () => {
			expect(calcDefinOptions(64, plusMinusOptions)).toBe('±32');
		});

		it('returns label for exact match at second-to-last option', () => {
			expect(calcDefinOptions(126, plusMinusOptions)).toBe('±63.0');
		});

		it('returns label for exact match at last option', () => {
			expect(calcDefinOptions(127, plusMinusOptions)).toBe('±64.0');
		});
	});

	describe('{+-} prefix interpolation', () => {
		it('interpolates between 1 and 64 for value 2', () => {
			expect(calcDefinOptions(2, plusMinusOptions)).toBe('±1');
		});

		it('interpolates between 1 and 64 for value 32', () => {
			expect(calcDefinOptions(32, plusMinusOptions)).toBe('±16');
		});

		it('interpolates between 1 and 64 for value 63', () => {
			expect(calcDefinOptions(63, plusMinusOptions)).toBe('±31.5');
		});

		it('interpolates between 64 and 126 for value 65', () => {
			expect(calcDefinOptions(65, plusMinusOptions)).toBe('±32.5');
		});

		it('interpolates between 64 and 126 for value 96', () => {
			expect(calcDefinOptions(96, plusMinusOptions)).toBe('±48');
		});

		it('interpolates between 64 and 126 for value 125', () => {
			expect(calcDefinOptions(125, plusMinusOptions)).toBe('±62.5');
		});
	});

	describe('string labels - no interpolation', () => {
		it('returns exact match for string labels', () => {
			expect(calcDefinOptions(0, stringOptions)).toBe('Pos');
		});

		it('returns exact match for string labels in middle', () => {
			expect(calcDefinOptions(3, stringOptions)).toBe('NegInv');
		});

		it('returns exact match for last string label', () => {
			expect(calcDefinOptions(5, stringOptions)).toBe('BipInv');
		});

		it('returns raw value when between options with non-numeric labels', () => {
			expect(calcDefinOptions(10, stringOptions)).toBe('10');
		});
	});

	describe('mixed labels (Off + numeric) - partial interpolation', () => {
		it('returns exact match for non-numeric label at start', () => {
			expect(calcDefinOptions(0, mixedOptions)).toBe('Off');
		});

		it('returns exact match for numeric label', () => {
			expect(calcDefinOptions(1, mixedOptions)).toBe('1');
		});

		it('returns raw value when curr label is non-numeric', () => {
			expect(calcDefinOptions(64, mixedOptions)).toBe('64');
		});

		it('interpolates when both labels are numeric', () => {
			expect(calcDefinOptions(126, mixedOptions)).toBe('126');
		});

		it('returns exact match for last option', () => {
			expect(calcDefinOptions(127, mixedOptions)).toBe('127');
		});
	});

	describe('out of range', () => {
		it('returns raw value when above max', () => {
			expect(calcDefinOptions(128, plusMinusOptions)).toBe('128');
		});

		it('returns raw value when below min', () => {
			expect(calcDefinOptions(-1, plusMinusOptions)).toBe('-1');
		});
	});

	describe('extraReplacements parameter', () => {
		it('uses extra replacements when provided', () => {
			const result = calcDefinOptions(0, plusMinusOptions, { '{+-}': '#' });
			expect(result).toBe('#0');
		});

		it('extra replacements override default', () => {
			const result = calcDefinOptions(0, plusMinusOptions, { '{+-}': '!' });
			expect(result).toBe('!0');
		});
	});

	describe('postfix dB and {00} replacement', () => {
		const dbOptions = parseDefin(['0 ~ -{00}, 64 ~ -6.0 dB, 127 ~ -0 dB']);

		it('exact match at 0 replaces {00} with ∞', () => {
			expect(calcDefinOptions(0, dbOptions)).toBe('-∞');
		});

		it('exact match at 64 returns -6.0 dB', () => {
			expect(calcDefinOptions(64, dbOptions)).toBe('-6.0 dB');
		});

		it('exact match at 127 returns -0 dB', () => {
			expect(calcDefinOptions(127, dbOptions)).toBe('-0 dB');
		});

		it('interpolates between 0 and 64 with postfix dB', () => {
			expect(calcDefinOptions(32, dbOptions)).toBe('-3.0 dB');
		});

		it('interpolates between 64 and 127 with postfix dB', () => {
			expect(calcDefinOptions(96, dbOptions)).toBe('-3.0 dB');
		});

		it('returns raw value when above max', () => {
			expect(calcDefinOptions(128, dbOptions)).toBe('128');
		});
	});

	describe('CLK mode stepped lookup', () => {
		const clkOptions = parseDefin(['0 ~ 1/64 T, 64 ~ 1/4 T, 127 ~ 2/1']);

		it('returns nearest label (value 0 → 1/64 T)', () => {
			expect(calcDefinOptions(0, clkOptions, undefined, true)).toBe('1/64 T');
		});

		it('returns nearest label (value 32 → 1/4 T, midpoint between 0 and 64)', () => {
			expect(calcDefinOptions(32, clkOptions, undefined, true)).toBe('1/4 T');
		});

		it('returns nearest label (value 64 → 1/4 T)', () => {
			expect(calcDefinOptions(64, clkOptions, undefined, true)).toBe('1/4 T');
		});

		it('returns nearest label (value 65 → 1/4 T, closer to 64 than 127)', () => {
			expect(calcDefinOptions(65, clkOptions, undefined, true)).toBe('1/4 T');
		});

		it('returns nearest label (value 96 → 2/1, closer to 127 than 64)', () => {
			expect(calcDefinOptions(96, clkOptions, undefined, true)).toBe('2/1');
		});

		it('returns nearest label (value 127 → 2/1)', () => {
			expect(calcDefinOptions(127, clkOptions, undefined, true)).toBe('2/1');
		});
	});
});

describe('applyDefinReplacements', () => {
	it('replaces {+-} with ±', () => {
		expect(applyDefinReplacements('{+-}0')).toBe('±0');
		expect(applyDefinReplacements('{+-}32.5')).toBe('±32.5');
	});

	it('replaces {00} with ∞ anywhere in label', () => {
		expect(applyDefinReplacements('-{00}')).toBe('-∞');
		expect(applyDefinReplacements('-{00} dB')).toBe('-∞ dB');
	});

	it('returns label unchanged when no match', () => {
		expect(applyDefinReplacements('Pos')).toBe('Pos');
		expect(applyDefinReplacements('32')).toBe('32');
		expect(applyDefinReplacements('-6.0 dB')).toBe('-6.0 dB');
	});

	it('uses extra replacements when provided', () => {
		expect(applyDefinReplacements('{+-}0', { '{+-}': '!' })).toBe('!0');
	});

	it('extra replacements override defaults', () => {
		expect(applyDefinReplacements('{+-}0', { '{+-}': '±', '{00}': '∞' })).toBe('±0');
	});

	it('definReplacements is exported and contains both {+-} and {00}', () => {
		expect(definReplacements['{+-}']).toBe('±');
		expect(definReplacements['{00}']).toBe('∞');
	});
});
