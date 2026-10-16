import { describe, expect, it } from 'vitest';
import { getModule } from '../../renderer/nmg2mods';
import type { ModuleDefinition } from '../../types';
import { formatParamDisplay, matchParamValues, parseUxNumber, type ParamValueOption } from '../moduleControls';

// First real module whose param `type` leads a combined valueDisplay (or any param of `type` when
// `combined` is false), so the labels come from the same formatters the canvas uses.
function findModule(type: string, combined: boolean): { moduleDef: ModuleDefinition; paramIndex: number } {
	for (let id = 1; id < 256; id++) {
		const moduleDef = getModule(id);
		const paramIndex = moduleDef?.params?.findIndex((p) => p.type === type) ?? -1;
		if (!moduleDef || paramIndex < 0) continue;
		const leads = moduleDef.ve?.some((e) => e.type === 'valueDisplay' && Array.isArray(e.ref) && e.ref[0] === paramIndex);
		if (leads === combined) return { moduleDef, paramIndex };
	}
	throw new Error(`no module with param type ${type}`);
}

function optionsFor(type: string, combined: boolean, values: Record<number, number> = {}): ParamValueOption[] {
	const { moduleDef, paramIndex } = findModule(type, combined);
	const lv = moduleDef.params!.map((_, i) => values[i] ?? 64);
	return Array.from({ length: 128 }, (_, raw) => {
		lv[paramIndex] = raw;
		return { raw, label: formatParamDisplay(moduleDef, paramIndex, lv) };
	});
}

describe('parseUxNumber', () => {
	it('reads the leading number with sign', () => {
		expect(parseUxNumber('-12')).toBe(-12);
		expect(parseUxNumber('+5   +3')).toBe(5);
		expect(parseUxNumber('-30 dB')).toBe(-30);
		expect(parseUxNumber('Off')).toBeNull();
	});

	it('normalises k and s units (to Hz / ms)', () => {
		expect(parseUxNumber('1.32kHz')).toBe(1320);
		expect(parseUxNumber('1.5s')).toBe(1500);
		expect(parseUxNumber('200m')).toBe(200);
		expect(parseUxNumber('440.00Hz')).toBe(440);
	});

	it('returns the bare number when unscaled', () => {
		expect(parseUxNumber('1.32kHz', false)).toBe(1.32);
	});
});

describe('matchParamValues', () => {
	const enumOpts: ParamValueOption[] = [
		{ raw: 0, label: 'Bip' },
		{ raw: 1, label: 'Pos' },
		{ raw: 2, label: 'Neg' },
	];

	it('empty query lists every value', () => {
		expect(matchParamValues(enumOpts, '')).toEqual(enumOpts);
	});

	it('#N picks the raw value', () => {
		expect(matchParamValues(enumOpts, '#2')).toEqual([{ raw: 2, label: 'Neg' }]);
	});

	it('text is a case-insensitive substring match', () => {
		expect(matchParamValues(enumOpts, 'po').map((o) => o.label)).toEqual(['Pos']);
	});

	it('collapses identical labels to their first raw value', () => {
		const opts = [
			{ raw: 0, label: '1/16' },
			{ raw: 1, label: '1/16' },
			{ raw: 2, label: '1/8' },
		];
		expect(matchParamValues(opts, '1/')).toEqual([opts[0], opts[2]]);
	});

	it('bipolar: -12 finds the value showing -12', () => {
		expect(matchParamValues(optionsFor('Bipolar_127', false), '-12')[0].label).toBe('-12');
	});

	it('Osc in Freq mode: 440 lists the nearest Hz value first', () => {
		const { moduleDef } = findModule('FreqCoarse', true);
		const modeIdx = moduleDef.params!.findIndex((p) => p.type.startsWith('FreqMode'));
		const fineIdx = moduleDef.params!.findIndex((p) => p.type === 'FreqFine');
		const best = matchParamValues(optionsFor('FreqCoarse', true, { [modeIdx]: 1, [fineIdx]: 64 }), '440')[0];
		expect(best.label).toMatch(/^4[34]\d\.\d+Hz$/);
	});

	it('Osc in Semi mode lists semitones, not Hz', () => {
		const { moduleDef } = findModule('FreqCoarse', true);
		const modeIdx = moduleDef.params!.findIndex((p) => p.type.startsWith('FreqMode'));
		const best = matchParamValues(optionsFor('FreqCoarse', true, { [modeIdx]: 0 }), '+12')[0];
		expect(best.raw).toBe(76);
	});

	it('Osc in Fac mode: 2 and x2 both find the x2.0 factor', () => {
		const { moduleDef } = findModule('FreqCoarse', true);
		const modeIdx = moduleDef.params!.findIndex((p) => p.type.startsWith('FreqMode'));
		const opts = optionsFor('FreqCoarse', true, { [modeIdx]: 2 });
		expect(matchParamValues(opts, '2')[0].label).toMatch(/^x2\.0/);
		expect(matchParamValues(opts, 'x2')[0].label).toMatch(/^x2\.0/);
	});

	it('Scratch ratio: 1 finds x1.00, -1 and -x1 find - x1.00', () => {
		const opts = optionsFor('ScratchRatio', false);
		expect(matchParamValues(opts, '1')[0]).toEqual({ raw: 80, label: 'x1.00' });
		expect(matchParamValues(opts, '-1')[0]).toEqual({ raw: 48, label: '- x1.00' });
		expect(matchParamValues(opts, '-x1')[0]).toEqual({ raw: 48, label: '- x1.00' });
	});

	it('envelope time: units are normalised (1.5s, 200m)', () => {
		const opts = optionsFor('EnvTime', false);
		expect(parseUxNumber(matchParamValues(opts, '1.5s')[0].label)).toBeCloseTo(1500, -2);
		expect(parseUxNumber(matchParamValues(opts, '200m')[0].label)).toBeCloseTo(200, -1);
	});

	it('envelope sustain level (adsrL, numeric formatter): 32 lists the value showing 32', () => {
		expect(matchParamValues(optionsFor('EnvLevel', false), '32')[0]).toEqual({ raw: 64, label: '32' });
	});

	it('LFO phase (lfoP, numeric formatter): 180 lists the value showing 180', () => {
		expect(matchParamValues(optionsFor('Phase', false), '180')[0].label).toBe('180');
	});

	it('every param of every module formats to a string label', () => {
		for (let id = 1; id < 256; id++) {
			const moduleDef = getModule(id);
			const lv = moduleDef?.params?.map(() => 64) ?? [];
			moduleDef?.params?.forEach((p, i) => expect(typeof formatParamDisplay(moduleDef, i, lv), `${moduleDef.short}.${p.name}`).toBe('string'));
		}
	});

	it('MIDI note: C#3 matches by name', () => {
		const match = matchParamValues(optionsFor('MidiNote', false), 'C#3');
		expect(match[0]).toEqual({ raw: 49, label: 'C#3' });
	});

	it('MIDI note: a bare number matches note names containing it', () => {
		const labels = matchParamValues(optionsFor('MidiNote', false), '3').map((o) => o.label);
		expect(labels).toContain('C3');
		expect(labels.every((l) => l.includes('3'))).toBe(true);
	});
});
