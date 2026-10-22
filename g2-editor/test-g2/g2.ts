import fs from 'fs';
import os from 'os';
import path from 'path';
import { ACTIONS } from '../e2e-duration/lib/actions/index';
import { cliRun, type ActionCtx, type ActionDef } from '../e2e-duration/lib/actions/ctx';
import { ModuleQueue } from '../e2e-duration/lib/actions/moduleQueue';
import { rng } from '../e2e-duration/lib/actions/pick';
import { runCli, snapshotG2 } from '../e2e-duration/lib/cli';
import { EventLog, type LogEvent } from '../e2e-duration/lib/eventLog';
import { launchReal } from '../e2e-duration/lib/launch';
import { Runner } from '../e2e-duration/lib/runner';

export type Mode = 'Patch' | 'Performance';
export type SlotFlags = { active: boolean; key: boolean }[];

// The daemon wraps the reply in `data`, one-shot doesn't (same fallback as useDeviceEvents.ts).
const flagsOf = (reply: any): SlotFlags => ((reply.data ?? reply).slots ?? []).map((s: any) => ({ active: s.active, key: s.key }));

// Well below the 300 s testTimeout, so a hung one-shot fails naming its command instead of as a test timeout.
const ONE_SHOT_TIMEOUT_MS = 60_000;

/** Slot active/key flags; through the editor's daemon while it runs, one-shot otherwise (two daemons would fight over USB). */
export const perfFlags = async (page?: ActionCtx['page']): Promise<SlotFlags> =>
	flagsOf(page ? JSON.parse(await cliRun(page, ['get-perf-settings'])) : await runCli(['get-perf-settings'], ONE_SHOT_TIMEOUT_MS));

export const g2Mode = async (): Promise<Mode> => (await runCli(['startup'], ONE_SHOT_TIMEOUT_MS)).device?.mode;

export const setMode = (mode: Mode) => runCli(['set-perf-mode', mode.toLowerCase()], ONE_SHOT_TIMEOUT_MS);

export const action = (name: string): ActionDef => {
	const a = ACTIONS.find((x) => x.name === name);
	if (!a) throw new Error(`no action ${name}`);
	return a;
};

/** The last `action` event (what Runner.runOne logged). */
export const lastAction = (log: EventLog): LogEvent | undefined => log.events.filter((e) => e.kind === 'action').at(-1);

export interface Editor {
	runner: Runner;
	ctx: ActionCtx;
	log: EventLog;
	close: () => Promise<void>;
}

/**
 * The real built editor with a duration-test Runner on it (no bursts), connected to the G2.
 * Every module type counts as added, so the Runner never forces addModules and addModules never inits a slot.
 */
export async function startEditor(seed = 1): Promise<Editor> {
	const snap = await snapshotG2();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-vitest-'));
	const log = new EventLog(dir);
	const launched = await launchReal(log);
	const rnd = rng(seed);
	const modules = new ModuleQueue(rnd);
	for (const d of modules.all) modules.added(d);
	const ctx: ActionCtx = { page: launched.page, app: launched.app, log, snap, mode: snap.mode, rnd, own: new Map(), modules };
	const runner = new Runner(ctx, log, { p: 0, max: 0 });
	let closed = false;
	const close = async () => {
		if (closed) return;
		closed = true;
		runner.stopPolling();
		await launched.cleanup();
		log.close();
	};
	runner.startPolling();
	// The editor connects by itself at startup; one click if it did not.
	if (!(await runner.waitConnected(40_000))) {
		await launched.page.locator('[data-testid="connection-status"]').click();
		if (!(await runner.waitConnected(40_000))) {
			await close();
			throw new Error(`editor never reached "connected" (log: ${dir})`);
		}
	}
	return { runner, ctx, log, close };
}
