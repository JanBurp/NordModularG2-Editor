import { describe, it, expect } from 'vitest';
import { meterRows } from '../vuAutoAssign';
import type { Cable, ModuleInstance, Patch } from '../../types';

const IN4 = 171; // 4-In: outputs Out1-4, meters above them
const OUT4 = 3; // 4-Out: inputs In1-4
const OUT2 = 4; // 2-Out: inputs InL/R
const IN2 = 170; // 2-In: outputs OutL/R
const MIX = 19; // Mix4-1B: one meter

function mod(index: number, type: number, horiz = 0, vert = 0): ModuleInstance {
	return { index, type, horiz, vert, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
}
const cable = (smod: number, scon: number, dmod: number, dcon: number): Cable => ({ colour: 0, smod, scon, dmod, dcon, dir: 1 });
// Every output of an input module to the same input of an output module
const wireAll = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => cable(from, i, to, i));

function patch(voice: { modules: ModuleInstance[]; cables: Cable[] }, fx = { modules: [] as ModuleInstance[], cables: [] as Cable[] }): Patch {
	const area = (a: typeof voice, name: string) => ({ name, modules: a.modules, cableList: a.cables, paramaterDataOfs: 0 });
	return { areas: [area(fx, 'fx'), area(voice, 'voice')] } as unknown as Patch;
}

describe('meterRows', () => {
	it('takes only meters whose jack is connected (meter N = jack N by x)', () => {
		const p = patch({ modules: [mod(1, IN4), mod(2, OUT2, 1)], cables: [cable(1, 1, 2, 0)] });
		expect(meterRows(p)).toEqual([
			[
				{ location: 1, moduleIndex: 1, ledNo: 1 },
				{ location: 1, moduleIndex: 2, ledNo: 0 },
			],
		]);
	});

	it('orders Voice inputs, other, outputs, then FX; a mixer counts when any of its jacks is connected', () => {
		const p = patch(
			{ modules: [mod(3, OUT2, 2), mod(2, MIX, 1), mod(1, IN2)], cables: [cable(1, 0, 2, 0), cable(2, 0, 3, 0)] },
			{ modules: [mod(5, OUT2, 1), mod(4, IN2)], cables: [cable(4, 1, 5, 1)] },
		);
		expect(meterRows(p)).toEqual([
			[
				{ location: 1, moduleIndex: 1, ledNo: 0 },
				{ location: 1, moduleIndex: 2, ledNo: 0 },
				{ location: 1, moduleIndex: 3, ledNo: 0 },
				{ location: 0, moduleIndex: 4, ledNo: 1 },
				{ location: 0, moduleIndex: 5, ledNo: 1 },
			],
		]);
	});

	it('is empty without connected meters', () => {
		expect(meterRows(patch({ modules: [mod(1, IN4), mod(2, MIX)], cables: [] }))).toEqual([]);
	});

	it('puts Voice and FX on separate rows when they do not fit one row together', () => {
		const p = patch(
			{ modules: [mod(1, IN4), mod(2, OUT4, 1)], cables: wireAll(1, 2, 4) },
			{ modules: [mod(3, IN2), mod(4, OUT2, 1)], cables: wireAll(3, 4, 1) },
		);
		const rows = meterRows(p);
		expect(rows.map((r) => r.map((m) => `${m.location}:${m.moduleIndex}`))).toEqual([
			['1:1', '1:1', '1:1', '1:1', '1:2', '1:2', '1:2', '1:2'],
			['0:3', '0:4'],
		]);
	});

	it('splits a side at category boundaries, and a category longer than a row into chunks', () => {
		// 4 inputs + 1 mixer + 4 outputs = 9: the outputs move to their own row
		const split = patch({ modules: [mod(1, IN4), mod(2, MIX, 1), mod(3, OUT4, 2)], cables: [...wireAll(1, 3, 4), cable(1, 0, 2, 0)] });
		expect(meterRows(split).map((r) => r.length)).toEqual([5, 4]);
		// 3 x 4-In fully connected = 12 inputs: 8, then the last 4 share a row with the 4 outputs
		const chunked = patch({
			modules: [mod(1, IN4), mod(2, IN4, 0, 2), mod(3, IN4, 0, 4), mod(4, OUT4, 1)],
			cables: [...wireAll(1, 4, 4), ...wireAll(2, 4, 4), ...wireAll(3, 4, 4)],
		});
		expect(meterRows(chunked).map((r) => r.length)).toEqual([8, 8]);
	});
});
