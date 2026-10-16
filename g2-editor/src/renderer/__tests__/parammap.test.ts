import { describe, expect, it } from 'vitest';
import { getParam, pitchShuttle } from '../parammap';
import { getAllModules } from '../nmg2mods';
import type { ParamDefinition } from '../../types';

// Icon-based mode switches must have a self-consistent option count and frame offset, since
// ModuleMode.vue/ModuleModeDropdown.vue rely on `defin` and `h` to slice the stacked icon sheet.
const ICON_MODE_TYPES = ['GateMode', 'OscWaveform_2', 'FlipFlopMode', 'PulseMode', 'LogicDelayMode', 'LfoWaveform_1', 'ClkDivMode', 'DriverType'];

// These instead render a real computed graph (ModuleGraph), not a static icon sheet.
// HpLpSlopeMode dispatches by moduleId (filterLowpass/filterHighpass); OscWaveform_3 dispatches
// by function name (oscShpBgraph) — see graphFunctions.ts.
const GRAPH_MODE_TYPES: { type: string; graph: boolean | string }[] = [
	{ type: 'HpLpSlopeMode', graph: true },
	{ type: 'OscWaveform_3', graph: 'oscShpBgraph' },
];

describe('icon-based mode switches', () => {
	it.each(ICON_MODE_TYPES)('%s has an icon set', (type) => {
		const paramDef = getParam(type) as ParamDefinition;
		expect(paramDef).toBeDefined();
		expect(paramDef.img).toBeTruthy();
	});

	// Newly-migrated switches: also lock in that the option count matches the value range,
	// since the popup renders one row per option based on low..high.
	it.each(['ClkDivMode', 'DriverType'])('%s option count matches its value range', (type) => {
		const paramDef = getParam(type) as ParamDefinition;
		const optionCount = paramDef.defin![0].split(',').length;
		expect(optionCount).toBe(paramDef.high - paramDef.low + 1);
	});

	it('ClkDivMode and DriverType were migrated to icon-based switches', () => {
		expect(getParam('ClkDivMode')?.img).toBe('ModeClkDiv');
		expect(getParam('DriverType')?.img).toBe('ModeDriver');
	});

	it.each(GRAPH_MODE_TYPES)('$type uses a computed graph, not a static icon sheet', ({ type, graph }) => {
		const paramDef = getParam(type) as ParamDefinition;
		expect(paramDef).toBeDefined();
		expect(paramDef.graph).toBe(graph);
		expect(paramDef.img).toBeFalsy();
	});

	it.each(ICON_MODE_TYPES)('%s has a positive-height frame and a non-empty option list', (type) => {
		const paramDef = getParam(type) as ParamDefinition;
		expect(paramDef.defin?.[0].split(',').length).toBeGreaterThan(1);
		expect(paramDef.high).toBeGreaterThan(paramDef.low);
	});

	it('HpLpSlopeMode option count matches its value range', () => {
		// (OscWaveform_3 is excluded here: its defin already skips value 3, a pre-existing gap
		// unrelated to the graph migration — see nmg2mods.ts history.)
		const paramDef = getParam('HpLpSlopeMode') as ParamDefinition;
		const optionCount = paramDef.defin![0].split(',').length;
		expect(optionCount).toBe(paramDef.high - paramDef.low + 1);
	});

	it('every module mode type referenced in nmg2mods.ts resolves to a defined parammap entry', () => {
		for (const mod of getAllModules()) {
			for (const mode of mod.modes ?? []) {
				expect(getParam(mode.type), `${mod.short}.${mode.name} (${mode.type})`).toBeDefined();
			}
		}
	});
});

describe('module parameter types', () => {
	it('every param type referenced in nmg2mods.ts resolves to a parammap entry with a valid range and a numeric default', () => {
		for (const mod of getAllModules()) {
			for (const p of mod.params ?? []) {
				const def = getParam(p.type) as ParamDefinition;
				expect(def, `${mod.short}.${p.name} (${p.type})`).toBeDefined();
				expect(def.low, `${mod.short}.${p.name} low<=high`).toBeLessThanOrEqual(def.high);
				expect(typeof def.def, `${mod.short}.${p.name} has a numeric default`).toBe('number');
			}
		}
	});
});

describe('pitchShuttle (Scratch ratio)', () => {
	it('matches the official ParamText::PitchShuttle text', () => {
		const cases: [number, string][] = [
			[0, '- x4.00'],
			[48, '- x1.00'],
			[63, '- x0.06'],
			[64, 'x0'],
			[80, 'x1.00'],
			[111, 'x2.94'],
			[127, 'x4.00'],
		];
		for (const [raw, label] of cases) expect(pitchShuttle(raw)).toBe(label);
	});
});
