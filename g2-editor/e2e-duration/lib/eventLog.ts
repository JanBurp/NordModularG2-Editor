import fs from 'fs';
import path from 'path';

export type EventKind = 'meta' | 'status' | 'action' | 'probe' | 'incident' | 'reset' | 'daemon' | 'main' | 'console' | 'error';

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

export function readEvents(file: string): LogEvent[] {
	return fs
		.readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l) as LogEvent);
}
