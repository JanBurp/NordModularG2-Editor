import type { Page } from '@playwright/test';
import { cliRun, pickAction, type ActionCtx } from './actions';
import { g2Count, sleep, waitFor } from './cli';
import type { EventLog } from './eventLog';
import { classify, DOWN_STATUSES, type Incident, type RecoveryLevel } from './report';
import { powerCycle } from './shelly';

const PROBE_EVERY_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 90_000;
// A spontaneous G2 reboot took ~105 s to re-enumerate (duration run 2026-10-04), so wait longer than that before escalating.
const SELF_RECONNECT_MS = 150_000;
const SELF_PROBE_EVERY_MS = 30_000;
const EDITOR_RECONNECT_MS = 45_000;
const AFTER_POWER_MS = 90_000;
const MAX_POWER_CYCLES = 3;

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
	Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

export class Runner {
	private status = 'unknown';
	/** Time the poller first saw a down status that no incident has handled yet. */
	private lossAt: number | null = null;
	private lastAction = '';
	private incidents = 0;
	private poller?: NodeJS.Timeout;

	constructor(
		private readonly ctx: ActionCtx,
		private readonly log: EventLog,
	) {}

	private get page(): Page {
		return this.ctx.page;
	}

	private async readStatus(): Promise<string> {
		try {
			return (await this.page.locator('[data-testid="connection-status"]').innerText({ timeout: 5000 })).trim().toLowerCase();
		} catch {
			return 'unknown';
		}
	}

	/** Records every status transition with its own timestamp, independent of the (possibly blocked) action loop. */
	startPolling(): void {
		this.poller = setInterval(async () => {
			const s = await this.readStatus();
			if (s === this.status || s === 'unknown') return;
			this.status = s;
			this.log.log('status', { status: s });
			if (DOWN_STATUSES.includes(s) && this.lossAt === null) this.lossAt = Date.now();
		}, 1000);
	}

	stopPolling(): void {
		clearInterval(this.poller);
	}

	waitConnected(timeoutMs: number): Promise<boolean> {
		return waitFor(() => this.status === 'connected', timeoutMs, 500);
	}

	async probe(): Promise<boolean> {
		try {
			await withTimeout(cliRun(this.page, ['get-patch', 'A']), PROBE_TIMEOUT_MS, 'get-patch probe');
			this.log.log('probe', { ok: true });
			return true;
		} catch (e) {
			this.log.log('probe', { ok: false, error: String(e) });
			return false;
		}
	}

	/** Returns whether it clicked. */
	private async clickReconnect(): Promise<boolean> {
		if (!DOWN_STATUSES.includes(this.status)) return false;
		this.log.log('main', { line: `[duration-test] clicking connection-status (was "${this.status}")` });
		await this.page.locator('[data-testid="connection-status"]').click().catch(() => undefined);
		return true;
	}

	/**
	 * Recovery ladder: wait for the daemon's own reconnect, then an editor reconnect, then Shelly power cycles.
	 * Logs one `incident` event. Throws when the G2 never comes back.
	 */
	private async recover(trigger: 'status' | 'probe'): Promise<void> {
		const start = trigger === 'status' ? (this.lossAt ?? Date.now()) : Date.now();
		this.lossAt = null;
		const id = ++this.incidents;
		const lastAction = this.lastAction;
		this.log.log('main', { line: `[duration-test] incident #${id} (${trigger}), status="${this.status}"` });

		// Taken right away, before the ladder changes anything: is the G2 still on USB?
		const enumerated = (await g2Count()) > 0;
		let level: RecoveryLevel = 'self';
		let cycles = 0;
		let healthy = false;

		if (trigger === 'probe') {
			// Connected but silent: keep probing for a while before escalating.
			healthy = await waitFor(async () => this.status === 'connected' && (await this.probe()), SELF_RECONNECT_MS, SELF_PROBE_EVERY_MS);
		} else {
			healthy = (await this.waitConnected(SELF_RECONNECT_MS)) && (await this.probe());
			if (!healthy) {
				// Only credit the click when the G2 was on USB to reconnect to; otherwise it came back by itself.
				const onUsb = (await g2Count()) > 0;
				const clicked = await this.clickReconnect();
				healthy = (await this.waitConnected(EDITOR_RECONNECT_MS)) && (await this.probe());
				if (healthy && clicked && onUsb) level = 'editor-reconnect';
			}
		}
		while (!healthy && cycles < MAX_POWER_CYCLES) {
			level = 'power-cycle';
			cycles++;
			const t0 = Date.now();
			const back = await powerCycle();
			this.log.log('reset', { reason: `incident #${id}`, ok: back, ms: Date.now() - t0 });
			healthy = (await this.waitConnected(AFTER_POWER_MS)) && (await this.probe());
			if (!healthy) {
				await this.clickReconnect();
				healthy = (await this.waitConnected(EDITOR_RECONNECT_MS)) && (await this.probe());
			}
		}
		if (!healthy) level = 'failed';

		const { cause, evidence } = classify(this.log.recentLines(Date.now() - start + 45_000), { enumerated, trigger });
		const incident: Omit<Incident, never> = { id, start, end: Date.now(), trigger, lastAction, level, powerCycles: cycles, cause, evidence, enumerated };
		this.log.log('incident', incident as unknown as Record<string, unknown>);
		this.lossAt = null;
		if (!healthy) throw new Error(`G2 did not recover after ${cycles} power cycles (incident #${id})`);
	}

	/** Runs until `deadline`; resolves normally, or throws when a recovery fails. */
	async run(deadline: number, intervalMs: number): Promise<void> {
		let lastProbe = Date.now();
		while (Date.now() < deadline) {
			if (this.lossAt !== null || DOWN_STATUSES.includes(this.status)) await this.recover('status');
			else if (Date.now() - lastProbe > PROBE_EVERY_MS) {
				lastProbe = Date.now();
				const actions = this.log.events.filter((e) => e.kind === 'action');
				this.log.log('main', {
					line: `[duration-test] ${Math.round((deadline - Date.now()) / 60_000)} min left; ${actions.length} actions (${actions.filter((e) => !e.ok).length} failed), ${this.incidents} incidents`,
				});
				if (!(await this.probe())) await this.recover('probe');
			}

			const action = pickAction(this.ctx);
			const t0 = Date.now();
			try {
				const note = await withTimeout(Promise.resolve(action.run(this.ctx)), ACTION_TIMEOUT_MS, action.name);
				this.log.log('action', { name: action.name, ok: true, ms: Date.now() - t0, note });
			} catch (e) {
				this.log.log('action', { name: action.name, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 300) });
			}
			this.lastAction = action.name;

			// An action that fails or hangs while the status still says "connected" is a silent-hang candidate.
			if (this.status === 'connected' && this.lossAt === null && !this.log.events.at(-1)?.ok && !(await this.probe())) await this.recover('probe');

			await sleep(intervalMs * (0.5 + this.ctx.rnd()));
		}
	}
}
