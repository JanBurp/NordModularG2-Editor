import { describe, expect, it } from 'vitest';
import { remapCablesForModule, remapModeValues, remapParamValues } from '../moduleReplace';
import type { Cable } from '@/types/patch';
import type { ModuleDefinition } from '@/types/module';

function cable(smod: number, scon: number, dmod: number, dcon: number, dir = 1): Cable {
	return { smod, scon, dmod, dcon, dir, colour: 1 };
}

function def(partial: Partial<ModuleDefinition>): ModuleDefinition {
	return { id: 0, short: '', long: '', height: 1, ...partial };
}

describe('remapParamValues', () => {
	it('carries the value over when name and type both match', () => {
		const oldDef = def({ params: [{ name: 'Level', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 }] });
		const newDef = def({ params: [{ name: 'Level', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 }] });
		expect(remapParamValues(oldDef, newDef, [42])).toEqual([42]);
	});

	it('is case-insensitive on name', () => {
		const oldDef = def({ params: [{ name: 'level', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 }] });
		const newDef = def({ params: [{ name: 'Level', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 }] });
		expect(remapParamValues(oldDef, newDef, [42])).toEqual([42]);
	});

	it('falls back to the factory default when the type differs (same name)', () => {
		const oldDef = def({ params: [{ name: 'Freq', type: 'FltFreq', n: 'KnobMedium', x: 0, y: 0 }] });
		// A type with no parammap entry so getParam(...)?.def ?? 64 falls back to the hard 64 default.
		const newDef = def({ params: [{ name: 'Freq', type: 'NoSuchParamType', n: 'KnobMedium', x: 0, y: 0 }] });
		expect(remapParamValues(oldDef, newDef, [99])).toEqual([64]);
	});

	it('falls back to the factory default when there is no old param of that name', () => {
		const oldDef = def({ params: [] });
		const newDef = def({ params: [{ name: 'Level', type: 'NoSuchParamType', n: 'KnobMedium', x: 0, y: 0 }] });
		expect(remapParamValues(oldDef, newDef, [])).toEqual([64]);
	});

	it('consumes each old param at most once (first match wins)', () => {
		const oldDef = def({
			params: [
				{ name: 'Lev', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 },
				{ name: 'Lev', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 },
			],
		});
		const newDef = def({
			params: [
				{ name: 'Lev', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 },
				{ name: 'Lev', type: 'Level_100', n: 'KnobMedium', x: 0, y: 0 },
			],
		});
		expect(remapParamValues(oldDef, newDef, [10, 20])).toEqual([10, 20]);
	});
});

describe('remapModeValues', () => {
	it('carries the value over when name and type both match, default 0 otherwise', () => {
		const oldDef = def({ modes: [{ name: 'Mode', type: 'PulseMode', x: 0, y: 0 }] });
		const newDef = def({
			modes: [
				{ name: 'Mode', type: 'PulseMode', x: 0, y: 0 },
				{ name: 'Extra', type: 'LogicDelayMode', x: 0, y: 0 },
			],
		});
		expect(remapModeValues(oldDef, newDef, [3])).toEqual([3, 0]);
	});
});

describe('remapCablesForModule', () => {
	const oldDef = def({
		inputs: [
			{ name: 'In', colour: 'red', x: 0, y: 0 },
			{ name: 'Pitch', colour: 'purple', x: 0, y: 0 },
		],
		outputs: [{ name: 'Out', colour: 'red', x: 0, y: 0 }],
	});

	it('remaps an output-side cable to the matching jack on the new module', () => {
		const newDef = def({ outputs: [{ name: 'Out', colour: 'red', x: 0, y: 0 }] });
		const cables = [cable(1, 0, 2, 0)]; // module 1's output 0 -> module 2's input 0
		const result = remapCablesForModule(cables, 1, oldDef, newDef);
		expect(result).toEqual([{ ...cables[0], scon: 0, dcon: 0 }]);
	});

	it('drops a cable whose moduleId-side jack has no equivalent on the new module', () => {
		const newDef = def({ outputs: [] }); // no outputs at all
		const cables = [cable(1, 0, 2, 0)];
		expect(remapCablesForModule(cables, 1, oldDef, newDef)).toEqual([]);
	});

	it('remaps an input-side cable (dcon) independent of the source module', () => {
		const newDef = def({ inputs: [{ name: 'In', colour: 'red', x: 0, y: 0 }] });
		const cables = [cable(9, 0, 1, 0)]; // some other module's output -> module 1's input 0 (In)
		const result = remapCablesForModule(cables, 1, oldDef, newDef);
		expect(result).toEqual([{ ...cables[0], scon: 0, dcon: 0 }]);
	});

	it('treats scon as an input index for a strap cable (dir=0)', () => {
		// Old module's jack index 1 (Pitch, purple) used as an input-strap source
		const newDef = def({ inputs: [{ name: 'Pitch', colour: 'purple', x: 0, y: 0 }] });
		const cables = [cable(1, 1, 9, 0, 0)];
		const result = remapCablesForModule(cables, 1, oldDef, newDef);
		expect(result).toEqual([{ ...cables[0], scon: 0, dcon: 0 }]);
	});

	it('leaves the non-moduleId endpoint untouched', () => {
		const newDef = def({ outputs: [{ name: 'Out', colour: 'red', x: 0, y: 0 }] });
		const cables = [cable(1, 0, 7, 3)];
		const result = remapCablesForModule(cables, 1, oldDef, newDef);
		expect(result[0].dmod).toBe(7);
		expect(result[0].dcon).toBe(3);
	});
});
