import { describe, expect, it } from 'vitest';
import type { LogEvent } from './eventLog';
import { bankListProblems } from './cli';
import { diffStates } from './consistency';
import { buildReport, buildSessions, classify, findAnomalies } from './report';

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
	it('a NACK before the loss wins over the disconnect it caused', () => {
		const c = classify(
			['[daemon-watch:2:1] {"type":"error","slot":"A","code":3}', '[diag] disconnect (command error, ret=-6): 1 cmds in last 1s'],
			{ enumerated: true, trigger: 'probe' },
		);
		expect(c.cause).toMatch(/NACK code 3/);
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
	it('folds a blip inside an incident recovery into that incident', () => {
		const inc: LogEvent = { ...incident, start: T0 + 100 * 1000, end: T0 + 200 * 1000 };
		const evs = [st(0, 'connected'), st(100, 'lost'), inc, st(150, 'connected'), st(152, 'lost'), st(200, 'connected')];
		const s = buildSessions(evs, T0 + 300 * 1000);
		expect(s.map((x) => [x.start, x.endedByRun])).toEqual([
			[T0, false],
			[T0 + 200 * 1000, true],
		]);
	});
	it('verdict follows recovery level', () => {
		const meta = { startedAt: T0, endedAt: T0 + 300_000, plannedMs: 300_000, seed: 1, commit: 'abc' };
		expect(buildReport(events, meta).verdict).toBe('DEGRADED');
		const pc = events.map((e) => (e.kind === 'incident' ? { ...e, level: 'power-cycle' } : e));
		expect(buildReport(pc, meta).verdict).toBe('FAIL');
		expect(buildReport([st(0, 'connected')], meta).verdict).toBe('PASS');
	});
	it('lists never-run actions, skips and module coverage', () => {
		const meta = { startedAt: T0, endedAt: T0 + 300_000, plannedMs: 300_000, seed: 1, commit: 'abc', actionNames: ['addModules', 'copyVariation'], moduleTypes: ['OscA', 'LfoA', 'Mix4-1A'] };
		const evs: LogEvent[] = [
			st(0, 'connected'),
			{ t: T0 + 1000, kind: 'action', name: 'addModules', ok: true, note: 'added OscA' },
			{ t: T0 + 2000, kind: 'action', name: 'addModules', ok: true, note: 'skipped: resources at 95%' },
			{ t: T0 + 1000, kind: 'module', short: 'OscA' },
		];
		const { markdown, json } = buildReport(evs, meta);
		expect(markdown).toContain('| addModules | 1 | 1 | 0 | 0 |');
		expect(markdown).toContain('| copyVariation | 0 | 0 | 0 | 0 |');
		expect(markdown).toContain('Used 1 of 3 types.');
		expect(json.moduleTypesUnused).toEqual(['LfoA', 'Mix4-1A']);
	});
});

describe('anomalies', () => {
	const meta = { startedAt: T0, endedAt: T0 + 300_000, plannedMs: 300_000, seed: 1, commit: 'abc' };
	const main = (line: string): LogEvent => ({ t: T0, kind: 'main', line });

	it('finds wrong get-patch replies, "Error"/garbled names and editor warnings', () => {
		const a = findAnomalies(
			[
				main('[daemon-watch:2:1] {"id":950,"ok":true,"data":{"slot":"A","name":"InitPatch1","text":"","size":56,"data":"7201040f0f14"}}'),
				main('[daemon-watch:2:1] {"id":951,"ok":true,"data":{"slot":"A","name":"x","text":"","size":7907,"data":"21000f01fc"}}'),
				main('[daemon-watch:2:1] {"type":"perf_settings","performance":{"name":"Error"},"slots":[{"slot":"A","name":"??q?B?"},{"slot":"B","name":"dust"}]}'),
				{ t: T0, kind: 'console', line: 'Cable skipped: module not found (source=3, dest=4)' },
				{ t: T0, kind: 'console', line: 'Cable skipped: module not found (source=7, dest=9)' },
				{ t: T0, kind: 'console', line: '[USB] 08:37:37.073 • Daemon Ready' },
			],
			meta,
		);
		expect(a.map((x) => [x.what, x.count])).toEqual([
			['editor: Cable skipped: module not found (source=N, dest=N)', 2],
			['get-patch reply is not patch data', 1],
			['G2 renamed a slot/performance "Error" (it does after a malformed or rejected message)', 1],
			['garbled slot/performance name in perf_settings', 1],
		]);
	});
	it('counts a bad name once per change, and links a rejected edit to its command', () => {
		const ps = (a: string, perf = 'P') => main(`[daemon-watch:2:1] {"type":"perf_settings","performance":{"name":"${perf}"},"slots":[{"slot":"A","name":"${a}"}]}`);
		const a = findAnomalies(
			[
				ps('x'),
				ps('Error'),
				ps('Error'),
				ps('y'),
				ps('Error', 'Perf. Corrupt'),
				main('[daemon-cmd:2:1]-> {"id":7,"cmd":"add-module","args":["D","va","61"]}'),
				main('[daemon-watch:2:1] {"id":7,"ok":false,"code":-17,"error":"the G2 rejected the edit"}'),
			],
			meta,
		);
		expect(a.map((x) => [x.what, x.count])).toEqual([
			['G2 renamed a slot/performance "Error" (it does after a malformed or rejected message)', 2],
			['G2 could not load a stored performance ("Perf. Corrupt")', 1],
			['G2 rejected an edit (NACK)', 1],
		]);
		expect(a[2].example).toBe('{"id":7,"cmd":"add-module","args":["D","va","61"]}');
	});
	it('flags a bank listing out of step and editor/G2 differences; any anomaly makes the verdict DEGRADED', () => {
		const initial = { mode: 'Patch', slots: [], patchBanks: { '1': [{ location: 1, name: 'a' }, { location: 2, name: 'b' }, { location: 1, name: 'a' }] }, perfBanks: {} };
		const evs: LogEvent[] = [st(0, 'connected'), { t: T0 + 1000, kind: 'consistency', slot: 'A', diffs: ['va modules only on G2: 3:OscA'] }];
		const r = buildReport(evs, { ...meta, initial });
		expect(r.verdict).toBe('DEGRADED');
		expect(r.markdown).toContain('| 1 | bank listing out of step | `patch bank 1: 1 of 3 entries repeat a location` |');
		expect(r.markdown).toContain('editor shows something else than the G2 has');
		expect(buildReport([st(0, 'connected'), { t: T0 + 1000, kind: 'consistency', slot: 'A', diffs: [] }], meta).verdict).toBe('PASS');
	});
	it('counts UI timeouts apart from skips', () => {
		const evs: LogEvent[] = [st(0, 'connected'), { t: T0 + 1000, kind: 'action', name: 'assignKnob', ok: true, note: 'skipped: assign menu (timeout: locator.waitFor: Timeout 3000ms exceeded.)' }];
		expect(buildReport(evs, { ...meta, actionNames: ['assignKnob'] }).markdown).toContain('| assignKnob | 0 | 0 | 1 | 0 |');
	});
});

describe('bankListProblems / diffStates', () => {
	it('a clean listing has no problems', () => {
		expect(bankListProblems({ patchBanks: { '1': [{ location: 1, name: 'a' }] }, perfBanks: { '2': [{ location: 1, name: 'p' }] } })).toEqual([]);
	});
	it('lists what only one side has', () => {
		const empty = { modules: [], cables: [], params: [] };
		const editor = { va: { modules: ['1:OscA', '2:LfoA'], cables: ['1-0-2-0'], params: ['1 modes=0'] }, fx: empty };
		const device = { va: { modules: ['1:OscA', '3:Mix4-1A'], cables: ['1-0-2-0'], params: ['1 modes=0'] }, fx: empty };
		expect(diffStates(editor, device)).toEqual(['va modules only in editor: 2:LfoA', 'va modules only on G2: 3:Mix4-1A']);
		expect(diffStates(editor, editor)).toEqual([]);
		const reversed = { va: { ...editor.va, cables: ['2-0-1-0'] }, fx: empty };
		expect(diffStates(editor, reversed)).toEqual([]);
		const moded = { va: { ...editor.va, params: ['1 modes=2'] }, fx: empty };
		expect(diffStates(moded, editor)).toEqual(['va params only in editor: 1 modes=2', 'va params only on G2: 1 modes=0']);
	});
});
