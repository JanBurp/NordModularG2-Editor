import { afterAll, describe, expect, inject, it } from 'vitest';
import { bankListProblems, snapshotG2 } from '../e2e-duration/lib/cli';
import { g2Mode, type Mode, perfFlags, setMode } from './g2';

describe.skipIf(!inject('g2'))('G2 via one-shot CLI', () => {
	let restore: Mode | undefined;

	afterAll(async () => {
		if (restore && (await g2Mode()) !== restore) await setMode(restore);
	});

	it('answers startup and list', async () => {
		const snap = await snapshotG2();
		expect(['Patch', 'Performance']).toContain(snap.mode);
		expect(snap.slots).toHaveLength(4);
		expect(bankListProblems(snap)).toEqual([]);
	});

	it('switches mode and back, leaving mode and slot flags as they were', async () => {
		const mode = await g2Mode();
		const flags = await perfFlags();
		restore = mode;
		await setMode(mode === 'Patch' ? 'Performance' : 'Patch');
		expect(await g2Mode()).not.toBe(mode);
		await setMode(mode);
		expect(await g2Mode()).toBe(mode);
		expect(await perfFlags()).toEqual(flags);
	});
});
