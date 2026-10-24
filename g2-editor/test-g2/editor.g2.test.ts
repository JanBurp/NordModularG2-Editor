import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ACTIONS } from '../e2e-duration/lib/actions/index';
import { cliRun, focusedSlot, teardown } from '../e2e-duration/lib/actions/ctx';
import { snapshotG2 } from '../e2e-duration/lib/cli';
import { checkConsistency, deviceState, type SlotState } from '../e2e-duration/lib/consistency';
import { action, backupPerf, type Editor, g2Mode, lastAction, type Mode, perfFlags, restorePerf, setMode, type SlotFlags, startEditor } from './g2';

// Long enough that the Runner's unlocker stays active.
const coverage = () => ({ from: Date.now(), until: Date.now() + 60 * 60_000 });

// Run by the other tests here.
const USED = new Set(['addModules', 'addCable', 'tweakParam', 'moveModule', 'togglePerfMode', 'slotActiveKey']);

/**
 * Runs every not-yet-run action that is enabled in the current mode once (adding test modules first when an
 * action needs some), each followed by an editor/G2 consistency check. Returns the problems, empty when all is well.
 */
async function runRemaining(g: Editor, done: Set<string>): Promise<string[]> {
	const { runner, ctx, log } = g;
	const problems: string[] = [];
	for (const a of ACTIONS) {
		if (USED.has(a.name) || done.has(a.name)) continue;
		if (a.enabled && !a.enabled(ctx)) await runner.runOne(action('addModules'));
		if (a.enabled && !a.enabled(ctx)) continue;
		done.add(a.name);
		await runner.runOne(a);
		const ev = lastAction(log);
		if (!ev?.ok) problems.push(`${a.name}: failed (${ev?.note ?? 'no log'})`);
		else if (String(ev.note ?? '').startsWith('skipped')) problems.push(`${a.name}: ${ev.note}`);
		const { diffs } = await checkConsistency(ctx.page);
		if (diffs.length) problems.push(`${a.name}: editor and G2 differ: ${diffs.join('; ')}`);
	}
	return problems;
}

const structure = (s: SlotState) => ({ va: [s.va.modules, s.va.cables], fx: [s.fx.modules, s.fx.cables] });

describe.skipIf(!inject('g2'))('editor on a connected G2', () => {
	let g: Editor | undefined;
	let origMode: Mode;
	let origFlags: SlotFlags;
	// Name of the backed-up performance; undefined once restored.
	let origPerf: string | undefined;
	// Actions runRemaining has run.
	const done = new Set<string>();

	beforeAll(async () => {
		origMode = await g2Mode();
		origFlags = await perfFlags();
		// The actions below load patches and edit all slots; nothing is stored to a bank.
		origPerf = await backupPerf();
		await setMode('Patch');
		expect((await snapshotG2()).mode).toBe('Patch');
		g = await startEditor();
		expect(g.ctx.mode).toBe('Patch');
	});

	afterAll(async () => {
		await g?.close();
		if (origPerf !== undefined) await restorePerf(origPerf);
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

	it('runs every other Patch-mode action once, each keeping editor and G2 consistent', { timeout: 30 * 60_000 }, async () => {
		expect(await runRemaining(g!, done)).toEqual([]);
		await teardown(g!.ctx);
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

	it('runs the Performance-only actions once, each keeping editor and G2 consistent', { timeout: 10 * 60_000 }, async () => {
		expect(g!.ctx.mode).toBe('Performance');
		expect(await runRemaining(g!, done)).toEqual([]);
		await teardown(g!.ctx);
		// Every action ran in one of the two modes.
		expect(ACTIONS.map((a) => a.name).filter((n) => !USED.has(n) && !done.has(n))).toEqual([]);
	});

	it('leaves the G2 as it found it', async () => {
		await g!.close();
		await restorePerf(origPerf!);
		origPerf = undefined;
		await setMode(origMode);
		expect(await g2Mode()).toBe(origMode);
		expect(await perfFlags()).toEqual(origFlags);
	});
});
