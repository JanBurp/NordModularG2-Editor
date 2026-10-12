import { describe, expect, it } from 'vitest';
import { getAllModules } from '../nmg2mods';
import { PARAM_TYPE_IDS } from '../paramTypeIds';

describe('PARAM_TYPE_IDS', () => {
	// Hidden modules (Driver, Resonator) don't exist in the official editor, so have no entry.
	it('has one id per nmg2mods param for every non-hidden module with params', () => {
		for (const def of getAllModules()) {
			const n = def.params?.length ?? 0;
			if (n === 0 || def.page?.name === 'Hidden') continue;
			expect(PARAM_TYPE_IDS[def.id]?.length, `${def.short} (${def.id})`).toBe(n);
		}
	});

	it('maps EnvADSR Attack/Decay/Sustain/Release to the official envelope ids', () => {
		expect(PARAM_TYPE_IDS[20].slice(1, 5)).toEqual([0x0b, 0x0c, 0x0d, 0x0e]);
	});
});
