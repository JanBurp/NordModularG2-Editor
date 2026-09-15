import { describe, expect, it } from 'vitest';
import { areModulesReplaceCompatible, getModule, getReplaceCandidates } from '../nmg2mods';

// These lock in areModulesReplaceCompatible's behaviour against real entries in nmg2mods.ts, since
// the heuristic is an approximation of Clavia's unrecoverable "replace group" table (see the doc
// comment on areModulesReplaceCompatible) and needs a regression guard.

describe('areModulesReplaceCompatible / getReplaceCandidates', () => {
	it('matches Mix4-1B and Mix4-1C (identical jack sets, different height/modes)', () => {
		const a = getModule(19); // Mix4-1B
		const b = getModule(123); // Mix4-1C
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		expect(areModulesReplaceCompatible(a!, b!)).toBe(true);
		expect(getReplaceCandidates(19).map((m) => m.id)).toContain(123);
	});

	it('matches FltLP and FltClassic (FltClassic has an extra input beyond FltLP)', () => {
		const a = getModule(87); // FltLP
		const b = getModule(92); // FltClassic
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		expect(areModulesReplaceCompatible(a!, b!)).toBe(true);
	});

	it('does not match Keyboard against other In/Out modules with different jack signatures', () => {
		const keyboard = getModule(1); // Keyboard
		expect(keyboard).toBeDefined();
		expect(getReplaceCandidates(1)).toEqual([]);
	});

	it('never includes the module itself in its own candidate list', () => {
		const candidates = getReplaceCandidates(19); // Mix4-1B
		expect(candidates.some((m) => m.id === 19)).toBe(false);
	});

	it('returns no candidates for an unknown module id', () => {
		expect(getReplaceCandidates(999999)).toEqual([]);
	});
});
