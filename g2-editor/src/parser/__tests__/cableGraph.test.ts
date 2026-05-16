import { describe, expect, it } from 'vitest';
import { findConnectedInputCables, findGroupOutputColor } from '../cableGraph';
import type { Cable } from '@/renderer/cableRenderer';

function cable(smod: number, scon: number, dmod: number, dcon: number, dir: number, colour = 1): Cable {
	return { smod, scon, dmod, dcon, dir, colour } as Cable;
}

describe('findConnectedInputCables', () => {
	it('returns empty for empty cable list', () => {
		expect(findConnectedInputCables([], 1, 0)).toEqual([]);
	});

	it('returns empty when no cables touch the start jack', () => {
		const cables = [cable(2, 0, 3, 0, 0)];
		expect(findConnectedInputCables(cables, 1, 0)).toEqual([]);
	});

	it('finds a single input-input cable connected to the start jack', () => {
		const c = cable(1, 0, 2, 0, 0);
		expect(findConnectedInputCables([c], 1, 0)).toEqual([c]);
	});

	it('follows a chain of input-input cables via BFS', () => {
		const c1 = cable(1, 0, 2, 0, 0);
		const c2 = cable(2, 0, 3, 0, 0);
		const c3 = cable(3, 0, 4, 0, 0);
		const result = findConnectedInputCables([c1, c2, c3], 1, 0);
		expect(result).toContain(c1);
		expect(result).toContain(c2);
		expect(result).toContain(c3);
		expect(result).toHaveLength(3);
	});

	it('ignores dir=1 (output) cables', () => {
		const c = cable(1, 0, 2, 0, 1);
		expect(findConnectedInputCables([c], 1, 0)).toEqual([]);
	});

	it('handles connection from destination side', () => {
		const c = cable(2, 0, 1, 0, 0);
		expect(findConnectedInputCables([c], 1, 0)).toEqual([c]);
	});
});

describe('findGroupOutputColor', () => {
	it('returns 6 (white) when no output is connected', () => {
		expect(findGroupOutputColor([], 1, 0, 2, 0)).toBe(6);
	});

	it('returns 6 when only input-input cables exist', () => {
		const cables = [cable(1, 0, 2, 0, 0, 3)];
		expect(findGroupOutputColor(cables, 1, 0, 2, 0)).toBe(6);
	});

	it('returns colour of output driving a jack in the group', () => {
		// output cable from module 0 driving module 1's input
		const out = cable(0, 0, 1, 0, 1, 4);
		expect(findGroupOutputColor([out], 1, 0, 2, 0)).toBe(4);
	});

	it('returns output colour when output drives a transitively connected jack', () => {
		// input-input chain: mod1.0 <-> mod2.0, then output drives mod2.0
		const inp = cable(1, 0, 2, 0, 0, 1);
		const out = cable(0, 0, 2, 0, 1, 7);
		expect(findGroupOutputColor([inp, out], 1, 0, 3, 0)).toBe(7);
	});
});
