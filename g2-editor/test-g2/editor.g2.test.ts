import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ACTIONS } from '../e2e-duration/lib/actions/index';
import { cliRun, focusedSlot, teardown } from '../e2e-duration/lib/actions/ctx';
import { snapshotG2 } from '../e2e-duration/lib/cli';
import { checkConsistency, deviceState, type SlotState } from '../e2e-duration/lib/consistency';
import { action, type Editor, g2Mode, lastAction, type Mode, perfFlags, setMode, type SlotFlags, startEditor } from './g2';

// Long enough that the Runner's unlocker stays active.
const coverage = () => ({ from: Date.now(), until: Date.now() + 60 * 60_000 });

const structure = (s: SlotState) => ({ va: [s.va.modules, s.va.cables], fx: [s.fx.modules, s.fx.cables] });

describe.skipIf(!inject('g2'))('editor on a connected G2', () => {
	let g: Editor | undefined;
	let origMode: Mode;
	let origFlags: SlotFlags;

	beforeAll(async () => {
		origMode = await g2Mode();
		origFlags = await perfFlags();
		await setMode('Patch');
		expect((await snapshotG2()).mode).toBe('Patch');
		g = await startEditor();
		expect(g.ctx.mode).toBe('Patch');
	});

	afterAll(async () => {
		await g?.close();
		if (origMode && (await g2Mode()) !== origMode) await setMode(origMode);
	});

	it('connects and answers a probe', async () => {
		expect(await g!.runner.probe()).toBe(true);
	});

	it('adds modules and a cable, tweaks and moves, stays consistent and tears down cleanly', async () => {
		const { runner, ctx, log } = g!;
		const slot = await focusedSlot(ctx.page);
		const before = deviceState(await cliRun(ctx.page, ['get-patch', slot]));
		for (const name of ['addModules', 'addCable', 'tweakParam', 'moveModule']) {
			await runner.runOne(action(name));
			const ev = lastAction(log);
			expect(ev, name).toMatchObject({ name, ok: true });
			if (name === 'addModules') expect(String(ev!.note)).toMatch(/^added /);
		}
		expect((await checkConsistency(ctx.page)).diffs).toEqual([]);
		await teardown(ctx);
		const after = deviceState(await cliRun(ctx.page, ['get-patch', slot]));
		expect(structure(after)).toEqual(structure(before));
	});

	it('coverage switches Patch → Performance to run slotActiveKey, which counts as covered', async () => {
		const { runner, ctx, log } = g!;
		for (const a of ACTIONS) if (a.name !== 'slotActiveKey') runner.covered.add(a.name);

		expect((await runner.step(coverage())).name).toBe('togglePerfMode');
		expect(lastAction(log)).toMatchObject({ name: 'togglePerfMode', ok: true });
		expect(ctx.mode).toBe('Performance');

		const flags = await perfFlags(ctx.page);
		expect((await runner.step(coverage())).name).toBe('slotActiveKey');
		const ev = lastAction(log);
		expect(ev).toMatchObject({ name: 'slotActiveKey', ok: true });
		expect(String(ev!.note)).not.toMatch(/^skipped/);
		expect(runner.covered.has('slotActiveKey')).toBe(true);

		expect(await runner.probe()).toBe(true);
		expect(await perfFlags(ctx.page)).toEqual(flags);
	});

	it('leaves the G2 as it found it', async () => {
		await g!.close();
		await setMode(origMode);
		expect(await g2Mode()).toBe(origMode);
		expect(await perfFlags()).toEqual(origFlags);
	});
});
