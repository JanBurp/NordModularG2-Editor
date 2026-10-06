import { describe, expect, it } from 'vitest';
import { areModulesReplaceCompatible, getDefaultParamValues, getModule, getReplaceCandidates, isValidInArea } from '../nmg2mods';

// These lock in areModulesReplaceCompatible's behaviour against real entries in nmg2mods.ts, since
// the heuristic is an approximation of Clavia's unrecoverable "replace group" table (see the doc
// comment on areModulesReplaceCompatible) and needs a regression guard.

describe('areModulesReplaceCompatible / getReplaceCandidates', () => {
	it('matches Mix4-1B and Mix4-1C (same category, identical jack sets)', () => {
		const a = getModule(19); // Mix4-1B
		const b = getModule(123); // Mix4-1C
		expect(a?.short).toBe('Mix4-1B');
		expect(b?.short).toBe('Mix4-1C');
		expect(areModulesReplaceCompatible(a!, b!)).toBe(true);
		expect(areModulesReplaceCompatible(b!, a!)).toBe(true); // symmetric
		expect(getReplaceCandidates(19, 'voice').map((m) => m.id)).toContain(123);
	});

	it('matches modules in the same category even with very different jack sets (LFOs)', () => {
		const lfoA = getModule(26); // LfoA: 2 inputs, 1 blue output
		const clkGen = getModule(68); // ClkGen: 1 input, 4 yellow outputs
		expect(lfoA?.short).toBe('LfoA');
		expect(clkGen?.short).toBe('ClkGen');
		expect(areModulesReplaceCompatible(lfoA!, clkGen!)).toBe(true);
		expect(getReplaceCandidates(26, 'voice').map((m) => m.id)).toContain(68);
	});

	it('matches Keyboard against other In/Out modules despite very different jack signatures', () => {
		const keyboard = getModule(1); // Keyboard
		expect(keyboard).toBeDefined();
		const candidates = getReplaceCandidates(1, 'voice');
		expect(candidates.length).toBeGreaterThan(0);
		expect(candidates.some((m) => m.id === 1)).toBe(false);
		// Every candidate must be reported compatible by the predicate itself.
		for (const c of candidates) expect(areModulesReplaceCompatible(keyboard!, c)).toBe(true);
	});

	it('does not match modules across different categories', () => {
		const oscA = getModule(97); // Osc category
		const fltLP = getModule(87); // Filter category
		expect(areModulesReplaceCompatible(oscA!, fltLP!)).toBe(false);
	});

	it('never includes the module itself in its own candidate list', () => {
		const candidates = getReplaceCandidates(19, 'voice'); // Mix4-1B
		expect(candidates.some((m) => m.id === 19)).toBe(false);
	});

	it('returns no candidates for an unknown module id', () => {
		expect(getReplaceCandidates(999999, 'voice')).toEqual([]);
	});

	it('excludes the Name bar module entirely: it has no candidates, and never appears as one', () => {
		const name = getModule(126); // Name bar
		expect(name).toBeDefined();
		expect(getReplaceCandidates(126, 'voice')).toEqual([]);
		// Name bar shares the "In/Out" category with Keyboard, but must never be offered as a target.
		expect(getReplaceCandidates(1, 'voice').some((m) => m.id === 126)).toBe(false);
	});

	it('offers Fx-In (127) only in the FX area', () => {
		expect(getReplaceCandidates(170, 'fx').some((m) => m.id === 127)).toBe(true); // 2-In
		expect(getReplaceCandidates(170, 'voice').some((m) => m.id === 127)).toBe(false);
	});
});

describe('isValidInArea', () => {
	it('allows Fx-In only in the FX area, every other module in both', () => {
		expect(isValidInArea(127, 'fx')).toBe(true);
		expect(isValidInArea(127, 'voice')).toBe(false);
		expect(isValidInArea(15, 'fx')).toBe(true); // Sw8-1
		expect(isValidInArea(15, 'voice')).toBe(true);
	});
});

describe('getDefaultParamValues', () => {
	it('defaults Vocoder bands to preset 0 (band i -> i+1) and keeps Emphasis/Monitor defs', () => {
		const vals = getDefaultParamValues(108);
		expect(vals.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
		expect(vals).toHaveLength(18);
	});

	it('defaults Mixer channel On switches to on, but leaves other OffOn params off', () => {
		expect(getDefaultParamValues(123).slice(4, 8)).toEqual([1, 1, 1, 1]); // Mix4-1C On1..On4
		const echoIdx = getModule(57)!.params!.findIndex((p) => p.name === 'Echo'); // Automate
		expect(echoIdx).toBeGreaterThanOrEqual(0);
		expect(getDefaultParamValues(57)[echoIdx]).toBe(0);
	});

	it('defaults Env KB switches to on', () => {
		// EnvADSR, ModADSR, EnvAHD, EnvMulti, EnvADR, EnvADDSR, ModAHD
		for (const id of [20, 23, 46, 52, 84, 119, 169]) {
			const kbIdx = getModule(id)!.params!.findIndex((p) => p.name === 'KB');
			expect(kbIdx).toBeGreaterThanOrEqual(0);
			expect(getDefaultParamValues(id)[kbIdx]).toBe(1);
		}
	});
});
