import { describe, expect, it } from 'vitest';
import { knobMapParams } from '../paramPages';
import type { ParamPageAssignment } from '../../types/patch';

const knob = (slotIndex: number, moduleIndex: number, paramIndex: number, isLed = 0): ParamPageAssignment => ({
	slotIndex,
	location: 1,
	moduleIndex,
	paramIndex,
	isLed,
});
const slotOf = () => 'A';

describe('knobMapParams', () => {
	it('returns knob params in slotIndex order', () => {
		const result = knobMapParams([knob(9, 2, 0), knob(0, 1, 3)], slotOf, () => -1);
		expect(result.map((t) => [t.moduleIndex, t.paramIndex])).toEqual([
			[1, 3],
			[2, 0],
		]);
	});

	it('adds a distinct button param right after its knob', () => {
		const result = knobMapParams([knob(0, 1, 0)], slotOf, () => 5);
		expect(result.map((t) => t.paramIndex)).toEqual([0, 5]);
	});

	it('skips a button param that mirrors the knob, or is itself on a knob', () => {
		expect(knobMapParams([knob(0, 1, 0)], slotOf, (a) => a.paramIndex).map((t) => t.paramIndex)).toEqual([0]);
		expect(knobMapParams([knob(0, 1, 0), knob(1, 1, 5)], slotOf, (a) => (a.paramIndex === 0 ? 5 : -1)).map((t) => t.paramIndex)).toEqual([0, 5]);
	});

	it('skips level-meter (LED) assignments', () => {
		expect(knobMapParams([knob(0, 1, 0, 1)], slotOf, () => -1)).toEqual([]);
	});
});
