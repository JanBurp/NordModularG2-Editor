import { test } from '@playwright/test';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { bankListProblems, CLI_PATH, g2Count, runCli, runningDaemons, snapshotG2, type G2Snapshot } from './lib/cli';
import { ACTIONS } from './lib/actions/index';
import type { ActionCtx } from './lib/actions/ctx';
import { ModuleQueue } from './lib/actions/moduleQueue';
import { EventLog } from './lib/eventLog';
import { launchReal } from './lib/launch';
import { buildReport, type RunMeta } from './lib/report';
import { rng } from './lib/actions/pick';
import { Runner } from './lib/runner';
import { powerCycle, shellyPreflight } from './lib/shelly';

/*
 * Options (environment variables; `npm run test:duration -- --help` lists the matching flags):
 *   DURATION_HOURS     run length (default 4)
 *   ACTION_INTERVAL_S  mean pause between actions, jittered 0.5-1.5x (default 6)
 *   BURST_P            chance per step of a burst of fast actions (default 1/6)
 *   BURST_MAX          most actions in one burst (default 15, at least 5)
 *   COVERAGE_MIN       minutes in which every action and module type must have run once (default 30)
 *   SEED               replay a run's random sequence (printed in the report)
 *   DURATION_HEADED=1  show the editor window so you can watch; don't click or type in it while it runs
 */
const HOURS = Number(process.env.DURATION_HOURS ?? 4);
const INTERVAL_S = Number(process.env.ACTION_INTERVAL_S ?? 6);
const BURST_P = Number(process.env.BURST_P ?? 1 / 6);
const BURST_MAX = Number(process.env.BURST_MAX ?? 15);
const COVERAGE_MIN = Number(process.env.COVERAGE_MIN ?? 30);
const SEED = Number(process.env.SEED ?? Date.now() % 2 ** 31);

function gitCommit(): string {
	try {
		const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
		return git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? '+dirty' : '');
	} catch {
		return 'unknown';
	}
}

test('G2 duration test', async () => {
	if (!fs.existsSync(CLI_PATH)) throw new Error(`${CLI_PATH} missing: cd cli && make && cd ../g2-editor && npm run postinstall`);
	const others = runningDaemons();
	if (others.length) throw new Error(`Another g2-cli daemon is running (close the editor first):\n${others.join('\n')}`);
	await shellyPreflight(); // throws before a long run if the plug is unreachable

	const startedAt = Date.now();
	const runDir = path.join(__dirname, '..', 'duration-report', new Date(startedAt).toISOString().replace(/[:.]/g, '-'));
	const log = new EventLog(runDir);
	const meta: RunMeta = { startedAt, endedAt: startedAt, plannedMs: HOURS * 3600_000, seed: SEED, commit: gitCommit(), coverageMs: COVERAGE_MIN * 60_000 };
	if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }).unref();

	let runner: Runner | undefined;
	let cleanup: (() => Promise<void>) | undefined;
	try {
		// Start from whatever state the G2 is in. A G2 that is absent or does not answer gets one power cycle first.
		let initial: G2Snapshot | undefined;
		for (let attempt = 0; attempt < 2 && !initial; attempt++) {
			try {
				if ((await g2Count()) === 0) throw new Error('no G2 on USB');
				initial = await snapshotG2();
			} catch (e) {
				if (attempt === 1) throw new Error(`G2 not usable at start: ${e}`);
				const t0 = Date.now();
				const ok = await powerCycle();
				log.log('reset', { reason: `startup: ${e}`, ok, ms: Date.now() - t0 });
			}
		}
		// An empty listing silently disables patch loading for the whole run (seen 2026-10-05).
		if (Object.keys(initial!.patchBanks).length === 0) {
			log.log('main', { line: '[duration-test] bank listing has no patches; retrying in 30 s' });
			await new Promise((r) => setTimeout(r, 30_000));
			initial = await snapshotG2();
			if (Object.keys(initial.patchBanks).length === 0) throw new Error('G2 bank listing returned no patches twice; is the G2 fully booted?');
		}
		// A listing that got out of step: once more, the report flags it if it stays that way.
		const problems = bankListProblems(initial!);
		if (problems.length) {
			log.log('main', { line: `[duration-test] bank listing out of step (${problems.join('; ')}); retrying` });
			initial = await snapshotG2();
		}
		meta.initial = initial;
		log.log('meta', { initial });

		const launched = await launchReal(log);
		cleanup = launched.cleanup;
		const rnd = rng(SEED);
		const modules = new ModuleQueue(rnd);
		meta.actionNames = ACTIONS.map((a) => a.name);
		meta.moduleTypes = modules.all.map((m) => m.short);
		const ctx: ActionCtx = { page: launched.page, app: launched.app, log, snap: initial!, mode: initial!.mode, rnd, own: new Map(), modules };
		runner = new Runner(ctx, log, { p: BURST_P, max: BURST_MAX }, async () => {
			await cleanup?.();
			const again = await launchReal(log);
			cleanup = again.cleanup;
			return again;
		});
		runner.startPolling();

		// The editor connects by itself at startup; one click if it did not.
		if (!(await runner.waitConnected(40_000))) {
			await launched.page.locator('[data-testid="connection-status"]').click();
			if (!(await runner.waitConnected(40_000))) throw new Error('editor never reached "connected" at startup');
		}
		await new Promise((r) => setTimeout(r, 5000));

		await runner.run(startedAt + meta.plannedMs, INTERVAL_S * 1000, { from: startedAt, until: startedAt + meta.coverageMs! });
	} catch (e) {
		meta.aborted = String(e);
		log.log('error', { line: meta.aborted });
	} finally {
		runner?.stopPolling();
		await cleanup?.();
		// Does the G2 still answer after the editor and daemon are gone?
		try {
			meta.final = { ok: true, mode: (await runCli(['startup'], 120_000)).device?.mode };
		} catch (e) {
			meta.final = { ok: false, error: String(e).slice(0, 200) };
		}
		meta.endedAt = Date.now();
		const { markdown, json, verdict } = buildReport(log.events, meta);
		fs.writeFileSync(path.join(runDir, 'report.md'), markdown);
		fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(json, null, 2));
		log.close();
		console.log(`\n${markdown}\n\nReport: ${runDir}/report.md  (verdict ${verdict})`);
	}
	if (meta.aborted) throw new Error(meta.aborted);
});
