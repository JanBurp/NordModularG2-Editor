import type { G2Snapshot } from './cli';
import type { LogEvent } from './eventLog';

export const DOWN_STATUSES = ['lost', 'disconnected', 'driver error', 'offline', 'not available'];

export interface Classification {
	cause: string;
	/** Key daemon line the classification is based on. */
	evidence?: string;
}

/**
 * Heuristic "probable cause" from the daemon/main/console lines around an incident.
 * `enumerated` is the `list-devices` result taken right after the loss (null = not checked).
 */
export function classify(lines: string[], ctx: { enumerated: boolean | null; trigger: 'status' | 'probe' | 'action' }): Classification {
	const find = (re: RegExp) => lines.find((l) => re.test(l));
	const driver = find(/usb_driver_error/);
	if (driver) return { cause: 'USB interface claim problem (usb_driver_error): another process holds the G2?', evidence: driver };

	const diag = find(/\[diag\] disconnect \(/);
	if (diag) {
		const m = diag.match(/disconnect \(([^,)]+), ret=(-?\d+)\)/);
		const why = m?.[1] ?? '';
		const ret = m?.[2] ?? '';
		const burst = diag.match(/(\d+) cmds in last 1s/)?.[1];
		const suffix = burst && Number(burst) > 3 ? ` (command burst: ${burst} cmds in the last second)` : '';
		if (why.includes('listener/no device')) {
			return {
				cause:
					(ctx.enumerated === false
						? 'Device vanished from USB: power loss, cable or G2 reset'
						: 'Listener got NO_DEVICE while the G2 still enumerates: G2 rebooted/re-enumerated or USB glitch') + suffix,
				evidence: diag,
			};
		}
		if (ret === '-7' || ret === '-8') return { cause: `G2 stopped answering (${ret === '-7' ? 'RECV' : 'TIMEOUT'}): wedged or busy` + suffix, evidence: diag };
		if (ret === '-6') return { cause: 'USB bulk write failed (SEND)' + suffix, evidence: diag };
		return { cause: `Command error (ret=${ret})` + suffix, evidence: diag };
	}

	const exit = find(/Exited with code|Daemon exited/);
	if (exit) return { cause: 'Daemon process exited without a [diag] line (crash?)', evidence: exit };
	if (ctx.trigger === 'probe') return { cause: 'Silent hang: connected but get-patch got no answer' };
	if (ctx.trigger === 'action') return { cause: 'An editor action failed or timed out without any disconnect event' };
	if (ctx.enumerated === false) return { cause: 'Device not on USB (no daemon diagnostics captured)' };
	return { cause: 'Unknown (no diagnostic lines captured)' };
}

export type RecoveryLevel = 'self' | 'editor-reconnect' | 'power-cycle' | 'failed';

export interface Incident {
	id: number;
	start: number;
	end: number;
	trigger: 'status' | 'probe' | 'action';
	lastAction: string;
	level: RecoveryLevel;
	powerCycles: number;
	cause: string;
	evidence?: string;
	enumerated: boolean | null;
}

export interface Session {
	start: number;
	end: number;
	/** true when the run (or the deadline) ended it rather than a loss */
	endedByRun: boolean;
	incident?: Incident;
}

export interface RunMeta {
	startedAt: number;
	endedAt: number;
	plannedMs: number;
	seed: number;
	commit: string;
	initial?: G2Snapshot;
	final?: { ok: boolean; mode?: string; error?: string };
	aborted?: string;
}

const SESSION_LINK_MS = 20_000;

export function buildSessions(events: LogEvent[], endedAt: number): Session[] {
	const incidents = events.filter((e) => e.kind === 'incident').map((e) => e as unknown as Incident & LogEvent);
	const sessions: Session[] = [];
	let open: number | null = null;
	for (const e of events) {
		if (e.kind !== 'status') continue;
		const s = String(e.status);
		if (s === 'connected' && open === null) open = e.t;
		else if (DOWN_STATUSES.includes(s) && open !== null) {
			sessions.push({ start: open, end: e.t, endedByRun: false, incident: nearest(incidents, e.t) });
			open = null;
		}
	}
	if (open !== null) sessions.push({ start: open, end: endedAt, endedByRun: true });
	return sessions;
}

function nearest(incidents: Incident[], t: number): Incident | undefined {
	return incidents.filter((i) => Math.abs(i.start - t) <= SESSION_LINK_MS).sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0];
}

export const fmtDur = (ms: number): string => {
	const s = Math.round(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h ? `${h}h${String(m).padStart(2, '0')}m${String(s % 60).padStart(2, '0')}s` : m ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};
const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-GB');

export type Verdict = 'PASS' | 'DEGRADED' | 'FAIL';

export function buildReport(events: LogEvent[], meta: RunMeta): { markdown: string; json: Record<string, unknown>; verdict: Verdict } {
	const incidents = events.filter((e) => e.kind === 'incident') as unknown as Incident[];
	const sessions = buildSessions(events, meta.endedAt);
	const actions = events.filter((e) => e.kind === 'action');
	const probes = events.filter((e) => e.kind === 'probe');
	const resets = events.filter((e) => e.kind === 'reset');
	const powerCyclesNeeded = incidents.filter((i) => i.level === 'power-cycle' || i.level === 'failed').length;

	const verdict: Verdict = meta.aborted || incidents.some((i) => i.level === 'failed') || powerCyclesNeeded > 0 ? 'FAIL' : incidents.length > 0 ? 'DEGRADED' : 'PASS';

	const byType = new Map<string, { ok: number; failed: number }>();
	for (const a of actions) {
		const c = byType.get(String(a.name)) ?? { ok: 0, failed: 0 };
		a.ok ? c.ok++ : c.failed++;
		byType.set(String(a.name), c);
	}

	const L: string[] = [];
	L.push(`# G2 duration test report — ${verdict}`, '');
	L.push(`- Run: ${new Date(meta.startedAt).toLocaleString('en-GB')} → ${new Date(meta.endedAt).toLocaleString('en-GB')} (${fmtDur(meta.endedAt - meta.startedAt)} of planned ${fmtDur(meta.plannedMs)})`);
	L.push(`- Seed: ${meta.seed}, commit: ${meta.commit}`);
	if (meta.aborted) L.push(`- **ABORTED:** ${meta.aborted}`);
	if (meta.initial) {
		const n = (b: Record<string, unknown[]>) => Object.values(b).reduce((a, l) => a + l.length, 0);
		L.push(
			`- G2 at start: ${meta.initial.mode} mode${meta.initial.performance ? ` ("${meta.initial.performance}")` : ''}; slots: ${meta.initial.slots.map((s) => `${s.slot}="${s.name}"`).join(', ')}; ${n(meta.initial.patchBanks)} bank patches, ${n(meta.initial.perfBanks)} bank performances`,
		);
	}
	if (meta.final) L.push(`- G2 after the run (one-shot \`startup\`): ${meta.final.ok ? `answers (${meta.final.mode})` : `**no answer** — ${meta.final.error}`}`);
	L.push('', '## Summary', '');
	L.push(`- Sessions: ${sessions.length}, incidents (disconnects/hangs): ${incidents.length}`);
	L.push(`- Recovered by itself: ${incidents.filter((i) => i.level === 'self').length}, by editor reconnect: ${incidents.filter((i) => i.level === 'editor-reconnect').length}, **needed G2 power cycle: ${powerCyclesNeeded}** (${resets.length} power cycles executed in total)`);
	L.push(`- Actions: ${actions.length} (${actions.filter((a) => !a.ok).length} failed); health probes: ${probes.length} (${probes.filter((p) => !p.ok).length} failed)`, '');

	L.push('## Sessions', '', '| # | Start | Duration | Ended by | Probable cause | Recovery |', '|---|---|---|---|---|---|');
	sessions.forEach((s, i) => {
		const inc = s.incident;
		L.push(`| ${i + 1} | ${fmtTime(s.start)} | ${fmtDur(s.end - s.start)} | ${s.endedByRun ? 'end of run' : 'connection lost'} | ${inc ? inc.cause : s.endedByRun ? '-' : 'unknown'} | ${inc ? `${inc.level} (down ${fmtDur(inc.end - inc.start)})` : '-'} |`);
	});
	if (sessions.length === 0) L.push('| - | never connected | | | | |');

	L.push('', '## Incidents', '');
	if (incidents.length === 0) L.push('None.');
	for (const i of incidents) {
		L.push(`### #${i.id} at ${fmtTime(i.start)} — down ${fmtDur(i.end - i.start)}, recovery: ${i.level}${i.powerCycles ? ` (${i.powerCycles} power cycle${i.powerCycles > 1 ? 's' : ''})` : ''}`);
		L.push(`- Detected via: ${i.trigger}; last action: ${i.lastAction || '-'}`);
		L.push(`- Probable cause: ${i.cause}`);
		L.push(`- G2 still on USB after loss: ${i.enumerated === null ? 'not checked' : i.enumerated ? 'yes' : 'no'}`);
		if (i.evidence) L.push(`- Evidence: \`${i.evidence.slice(0, 300)}\``);
		L.push('');
	}

	L.push('## Actions', '', '| Action | OK | Failed |', '|---|---|---|');
	for (const [name, c] of [...byType].sort()) L.push(`| ${name} | ${c.ok} | ${c.failed} |`);
	L.push('');

	return { markdown: L.join('\n'), verdict, json: { verdict, meta, sessions, incidents, actions: Object.fromEntries(byType) } };
}
