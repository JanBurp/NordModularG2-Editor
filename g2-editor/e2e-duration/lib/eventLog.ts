import fs from 'fs';
import path from 'path';

export type EventKind = 'meta' | 'status' | 'action' | 'probe' | 'incident' | 'reset' | 'daemon' | 'main' | 'console' | 'error' | 'module' | 'consistency';

export interface LogEvent {
	/** ms since epoch */
	t: number;
	kind: EventKind;
	[key: string]: unknown;
}

/** Append-only JSONL event log; also keeps events in memory so the report can be built at the end. */
export class EventLog {
	readonly events: LogEvent[] = [];
	private readonly fd: number;

	constructor(readonly dir: string) {
		fs.mkdirSync(dir, { recursive: true });
		this.fd = fs.openSync(path.join(dir, 'events.jsonl'), 'a');
	}

	log(kind: EventKind, data: Record<string, unknown> = {}): LogEvent {
		const ev: LogEvent = { t: Date.now(), kind, ...data };
		this.events.push(ev);
		fs.writeSync(this.fd, JSON.stringify(ev) + '\n');
		const line = progressLine(ev);
		if (line) console.log(`${new Date(ev.t).toLocaleTimeString()} ${line}`);
		return ev;
	}

	/** Daemon/main/console lines logged within the last `ms` milliseconds. */
	recentLines(ms: number, kinds: EventKind[] = ['daemon', 'main', 'console']): string[] {
		const since = Date.now() - ms;
		return this.events.filter((e) => e.t >= since && kinds.includes(e.kind)).map((e) => String(e.line ?? ''));
	}

	close(): void {
		fs.closeSync(this.fd);
	}
}

/** One-line terminal summary for the events worth watching live; daemon/console traffic stays in events.jsonl only. */
function progressLine(ev: LogEvent): string | null {
	switch (ev.kind) {
		case 'action':
			return `${ev.ok ? 'ok  ' : 'FAIL'}${ev.fast ? ' »' : ''} ${ev.name} (${ev.ms} ms) ${ev.ok ? (ev.note ?? '') : ev.error}`;
		case 'status':
			return `status: ${ev.status}`;
		case 'probe':
			return ev.ok ? 'probe ok' : `PROBE FAILED ${ev.error ?? ''}`;
		case 'incident':
			return `INCIDENT #${ev.id}: ${ev.cause}, recovery: ${ev.level}, down ${Math.round((Number(ev.end) - Number(ev.start)) / 1000)} s`;
		case 'reset':
			return `power cycle (${ev.reason}): ${ev.ok ? 'back' : 'NOT BACK'} after ${Math.round(Number(ev.ms) / 1000)} s`;
		case 'error':
			return `ERROR ${ev.line}`;
		case 'consistency':
			return ev.error ? `consistency check failed: ${ev.error}` : (ev.diffs as string[]).length ? `EDITOR ≠ G2 (slot ${ev.slot}): ${(ev.diffs as string[]).join('; ')}` : null;
		case 'main':
			return String(ev.line ?? '').startsWith('[duration-test]') ? String(ev.line) : null;
		default:
			return null;
	}
}

export function readEvents(file: string): LogEvent[] {
	return fs
		.readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l) as LogEvent);
}
