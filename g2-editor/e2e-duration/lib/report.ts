import { bankListProblems, type G2Snapshot } from './cli';
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

	// Checked before [diag]: a rejected command (e.g. add-module with index 128) can wedge the G2, so
	// the later disconnect is a consequence, not the cause.
	const nack = find(/"type":"error","slot":"[A-D]","code":\d+|"error":"the G2 rejected the edit"/);
	if (nack) return { cause: `G2 rejected a command (NACK${nack.includes('"type":"error"') ? ` code ${nack.match(/"code":(\d+)/)?.[1]}` : ''}) before the loss`, evidence: nack };

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

	const closed = find(/\[duration-test\] Electron app closed/);
	if (closed) return { cause: 'Editor app closed (window closed / app quit); the G2 was not involved', evidence: find(/\[window\]|\[app\]/) ?? closed };
	const exit = find(/Exited with code|Daemon exited/);
	if (exit) return { cause: 'Daemon process exited without a [diag] line (crash?)', evidence: exit };
	if (ctx.trigger === 'probe') return { cause: 'Silent hang: connected but get-patch got no answer' };
	if (ctx.trigger === 'action') return { cause: 'An editor action failed or timed out without any disconnect event' };
	if (ctx.enumerated === false) return { cause: 'Device not on USB (no daemon diagnostics captured)' };
	return { cause: 'Unknown (no diagnostic lines captured)' };
}

export type RecoveryLevel = 'self' | 'editor-reconnect' | 'app-relaunch' | 'power-cycle' | 'failed';

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
	/** Every action the run could pick, so never-run ones show up as 0. */
	actionNames?: string[];
	/** Short names of every user-addable module type. */
	moduleTypes?: string[];
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
	// A blip inside an incident's recovery (e.g. the G2 re-enumerating once while booting after a power cycle) belongs to that incident.
	return sessions.filter((s) => s.endedByRun || !incidents.some((i) => i.start <= s.start && s.end <= i.end));
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

/** An orSkip note for a UI element that didn't appear in time: a skip, but possibly a UI bug. */
export const UI_TIMEOUT_NOTE = /\((timeout: |element detached)/;

export interface Anomaly {
	what: string;
	count: number;
	example: string;
}

/** Names the G2 substitutes: "Error" after a message it rejected, the others for a stored patch/performance it won't load. */
const G2_BAD_NAMES: Record<string, string> = {
	Error: 'G2 renamed a slot/performance "Error" (it does after a malformed or rejected message)',
	'Patch Corrupt': 'G2 could not load a stored patch ("Patch Corrupt")',
	'Perf. Corrupt': 'G2 could not load a stored performance ("Perf. Corrupt")',
};

/**
 * Things that went wrong without a disconnect or a failed action: editor warnings/errors, G2 replies of the
 * wrong kind, edits the G2 rejected, slot names the G2 only shows after a malformed message or a failed load,
 * a garbled bank listing, and editor state that differs from the G2's. Each one turns a PASS into DEGRADED.
 */
/** The JSON object of a "[daemon-…] {…}" log line, or null. */
function parseJson(line: string): any {
	try {
		return JSON.parse(line.slice(line.indexOf('{')));
	} catch {
		return null;
	}
}

export function findAnomalies(events: LogEvent[], meta: RunMeta): Anomaly[] {
	const found = new Map<string, Anomaly>();
	const add = (what: string, example: string) => {
		const a = found.get(what) ?? { what, count: 0, example: example.slice(0, 300) };
		a.count++;
		found.set(what, a);
	};
	// perf_settings repeats a bad name on every update, so only a change to one counts.
	const lastName = new Map<string, string>();
	const cmdById = new Map<string, string>();
	for (const e of events) {
		const line = String(e.line ?? '');
		// The editor's connection log ("[USB] 08:37:34.897 • Daemon Ready") goes out as warnings too; it isn't one.
		if (e.kind === 'console') {
			if (!/^\[USB\] \d\d:\d\d:\d\d\.\d+ [•→←]/.test(line)) add(`editor: ${line.replace(/\d+/g, 'N').slice(0, 100)}`, line);
		}
		else if (e.kind === 'consistency' && (e.diffs as string[] | undefined)?.length) add('editor shows something else than the G2 has', `slot ${e.slot}: ${(e.diffs as string[]).join('; ')}`);
		else if (e.kind === 'main' && line.includes('"ok":true,"data":{"slot":')) {
			const tag = line.match(/"size":\d+,"data":"([0-9a-f]{2})/)?.[1];
			if (tag && tag !== '21') add('get-patch reply is not patch data', line);
		} else if (e.kind === 'main' && line.includes('"type":"perf_settings"')) {
			const ps = parseJson(line);
			const named = [['performance', ps?.performance?.name], ...(ps?.slots ?? []).map((s: { slot: string; name: string }) => [s.slot, s.name])];
			for (const [where, name] of named) {
				if (typeof name !== 'string') continue;
				const changed = lastName.get(where) !== name;
				lastName.set(where, name);
				if (G2_BAD_NAMES[name]) {
					if (changed) add(G2_BAD_NAMES[name], `${where}: ${line}`);
				} else if (/[?\x00-\x1f]/.test(name)) add('garbled slot/performance name in perf_settings', `"${name}" in ${line}`);
			}
		} else if (e.kind === 'main' && line.includes('-> {"id":')) {
			const id = line.match(/-> \{"id":(\d+)/)?.[1];
			if (id) cmdById.set(id, line.slice(line.indexOf('->') + 3));
		} else if (e.kind === 'main' && line.includes('"error":"the G2 rejected the edit"')) {
			const id = line.match(/"id":(\d+)/)?.[1];
			add('G2 rejected an edit (NACK)', (id && cmdById.get(id)) ?? line);
		} else if (e.kind === 'main' && /"type":"error","slot":"[A-D]"/.test(line)) add('G2 NACK outside a waited-for edit', line);
	}
	if (meta.initial) for (const p of bankListProblems(meta.initial)) add('bank listing out of step', p);
	return [...found.values()].sort((a, b) => b.count - a.count);
}

export function buildReport(events: LogEvent[], meta: RunMeta): { markdown: string; json: Record<string, unknown>; verdict: Verdict } {
	const incidents = events.filter((e) => e.kind === 'incident') as unknown as Incident[];
	const sessions = buildSessions(events, meta.endedAt);
	const actions = events.filter((e) => e.kind === 'action');
	const probes = events.filter((e) => e.kind === 'probe');
	const checks = events.filter((e) => e.kind === 'consistency');
	const resets = events.filter((e) => e.kind === 'reset');
	const powerCyclesNeeded = incidents.filter((i) => i.level === 'power-cycle' || i.level === 'failed').length;

	const anomalies = findAnomalies(events, meta);
	const verdict: Verdict = meta.aborted || incidents.some((i) => i.level === 'failed') || powerCyclesNeeded > 0 ? 'FAIL' : incidents.length > 0 || anomalies.length > 0 ? 'DEGRADED' : 'PASS';

	const byType = new Map<string, { ok: number; failed: number; skipped: number; timeout: number }>((meta.actionNames ?? []).map((n) => [n, { ok: 0, failed: 0, skipped: 0, timeout: 0 }]));
	for (const a of actions) {
		const c = byType.get(String(a.name)) ?? { ok: 0, failed: 0, skipped: 0, timeout: 0 };
		const note = String(a.note ?? '');
		if (!a.ok) c.failed++;
		else if (note.startsWith('skipped') && UI_TIMEOUT_NOTE.test(note)) c.timeout++;
		else if (note.startsWith('skipped')) c.skipped++;
		else c.ok++;
		byType.set(String(a.name), c);
	}
	const usedTypes = new Set(events.filter((e) => e.kind === 'module').map((e) => String(e.short)));
	const unusedTypes = (meta.moduleTypes ?? []).filter((t) => !usedTypes.has(t));
	const bursts = events.filter((e) => e.kind === 'main' && String(e.line).startsWith('[duration-test] burst')).length;

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
	L.push(`- Recovered by itself: ${incidents.filter((i) => i.level === 'self').length}, by editor reconnect: ${incidents.filter((i) => i.level === 'editor-reconnect').length}, by app relaunch: ${incidents.filter((i) => i.level === 'app-relaunch').length}, **needed G2 power cycle: ${powerCyclesNeeded}** (${resets.length} power cycles executed in total)`);
	L.push(`- Actions: ${actions.length} (${actions.filter((a) => !a.ok).length} failed); health probes: ${probes.length} (${probes.filter((p) => !p.ok).length} failed)`);
	L.push(`- Editor/G2 consistency checks: ${checks.length} (${checks.filter((c) => (c.diffs as string[] | undefined)?.length).length} differed, ${checks.filter((c) => c.error).length} errors); anomalies: ${anomalies.length}`, '');

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

	L.push('## Anomalies', '');
	if (anomalies.length === 0) L.push('None.');
	else {
		L.push('| Count | What | Example |', '|---|---|---|');
		for (const a of anomalies) L.push(`| ${a.count} | ${a.what.replace(/\|/g, '\\|')} | \`${a.example.slice(0, 160).replace(/\|/g, '\\|').replace(/`/g, "'")}\` |`);
	}
	L.push('');

	L.push('## Actions', '', `${bursts} fast bursts. UI timeout = a menu/dialog that didn't appear in time (screenshots in failures/).`, '', '| Action | OK | Skipped | UI timeout | Failed |', '|---|---|---|---|---|');
	for (const [name, c] of [...byType].sort()) L.push(`| ${name} | ${c.ok} | ${c.skipped} | ${c.timeout} | ${c.failed} |`);
	L.push('', '## Module types', '', `Used ${usedTypes.size} of ${meta.moduleTypes?.length ?? '?'} types.`);
	if (unusedTypes.length) L.push('', `Not used: ${unusedTypes.join(', ')}`);
	L.push('');

	return { markdown: L.join('\n'), verdict, json: { verdict, meta, sessions, incidents, anomalies, actions: Object.fromEntries(byType), moduleTypesUsed: [...usedTypes], moduleTypesUnused: unusedTypes, bursts } };
}
