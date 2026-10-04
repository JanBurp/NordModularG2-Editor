import { describe, expect, it } from 'vitest';
import type { LogEvent } from './eventLog';
import { buildReport, buildSessions, classify } from './report';

const T0 = 1_700_000_000_000;
const st = (t: number, status: string): LogEvent => ({ t: T0 + t * 1000, kind: 'status', status });

describe('classify', () => {
	it('vanished device', () => {
		const c = classify(['[diag] disconnect (listener/no device, ret=0): 1 cmds in last 1s'], { enumerated: false, trigger: 'status' });
		expect(c.cause).toMatch(/vanished/);
	});
	it('listener NO_DEVICE while still enumerated', () => {
		expect(classify(['[diag] disconnect (listener/no device, ret=0): 0 cmds'], { enumerated: true, trigger: 'status' }).cause).toMatch(/still enumerates/);
	});
	it('no answer + burst', () => {
		const c = classify(['[diag] disconnect (command error, ret=-8): 9 cmds in last 1s, last cmd x'], { enumerated: true, trigger: 'status' });
		expect(c.cause).toMatch(/TIMEOUT/);
		expect(c.cause).toMatch(/burst: 9/);
	});
	it('driver error wins', () => {
		expect(classify(['{"type":"usb_driver_error","data":"LIBUSB_ERROR_BUSY"}'], { enumerated: true, trigger: 'status' }).cause).toMatch(/claim/);
	});
	it('silent hang and unknown', () => {
		expect(classify([], { enumerated: true, trigger: 'probe' }).cause).toMatch(/Silent hang/);
		expect(classify([], { enumerated: null, trigger: 'status' }).cause).toMatch(/Unknown/);
	});
});

describe('buildSessions / buildReport', () => {
	const incident: LogEvent = { t: T0 + 100 * 1000, kind: 'incident', id: 1, start: T0 + 100 * 1000, end: T0 + 130 * 1000, trigger: 'status', lastAction: 'tweakParam', level: 'self', powerCycles: 0, cause: 'x', enumerated: true };
	const events = [st(0, 'connecting'), st(5, 'connected'), st(100, 'lost'), incident, st(130, 'connected'), st(200, 'loading'), st(201, 'connected')];

	it('splits sessions on down statuses only', () => {
		const s = buildSessions(events, T0 + 300 * 1000);
		expect(s).toHaveLength(2);
		expect(s[0].incident?.id).toBe(1);
		expect(s[1].endedByRun).toBe(true);
	});
	it('verdict follows recovery level', () => {
		const meta = { startedAt: T0, endedAt: T0 + 300_000, plannedMs: 300_000, seed: 1, commit: 'abc' };
		expect(buildReport(events, meta).verdict).toBe('DEGRADED');
		const pc = events.map((e) => (e.kind === 'incident' ? { ...e, level: 'power-cycle' } : e));
		expect(buildReport(pc, meta).verdict).toBe('FAIL');
		expect(buildReport([st(0, 'connected')], meta).verdict).toBe('PASS');
	});
});
