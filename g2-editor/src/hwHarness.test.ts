// TEMPORARY hardware harness (real G2 + real g2-cli daemon). Run: HW=1 npx vitest run src/hwHarness.test.ts
import { describe, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useDeviceStore, DeviceStatus } from '@/store/device';
import { useUiStore } from '@/store/ui';
import { useHistoryStore } from '@/store/history';
import { getModule } from '@/renderer/nmg2mods';

const CLI = '/Users/jan/Music/Gear/NordModularG2/EDITOR/new-editor/cli/build/bin/g2-cli';
const FIX = '/Users/jan/Music/Gear/NordModularG2/EDITOR/new-editor/test-patches/' + (process.env.FIXTURE ?? 'EmptyPatch.pch2');
const TID = Number(process.env.TID ?? 13);
const LOG = '/tmp/w/hw.log';
const t0 = Date.now();
const log = (s: string) => fs.appendFileSync(LOG, `${((Date.now() - t0) / 1000).toFixed(3)} ${s}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let proc: ChildProcess;
let nextId = 0;
const pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();
let disconnected = 0;
let exited = false;
const pendingReload = new Set<string>();
const DELAY = Number(process.env.DELAY ?? 0);
const ECHO = !!process.env.ECHO;

const stats = { acks: [] as number[], early: 0, total: 0, earlyByCmd: {} as Record<string, number>, lastCmds: [] as string[], failCtx: '' };
let pendingSince = 0;
let ackSeq = 0;
let needAck = 0;
const LOCK = !!process.env.LOCK;
async function send(cmd: string, args: unknown[]): Promise<string> {
	if (LOCK && needAck > ackSeq) {
		const t = Date.now();
		while (needAck > ackSeq && Date.now() - t < 2500) await sleep(5);
		log(`lock waited ${Date.now() - t}ms (acked=${ackSeq >= needAck})`);
	}
	const slotCmd = cmd !== 'get-patch' && cmd !== 'upload-patch';
	stats.total++;
	const early = needAck > ackSeq;
	if (early) {
		stats.early++;
		const k = cmd === 'seq' ? 'seq:' + (args as any[][])[0][0] : cmd;
		stats.earlyByCmd[k] = (stats.earlyByCmd[k] ?? 0) + 1;
	}
	stats.lastCmds.push(`${((Date.now() - t0) / 1000).toFixed(2)} ${cmd}${early ? ' EARLY(ack pending ' + (Date.now() - pendingSince) + 'ms)' : ''}`);
	if (stats.lastCmds.length > 6) stats.lastCmds.shift();
	if (slotCmd) {
		needAck = ackSeq + 1;
		pendingSince = Date.now();
	}
	return sendRaw(cmd, args);
}
function sendRaw(cmd: string, args: unknown[]): Promise<string> {
	return new Promise((resolve, reject) => {
		if (exited) return reject(new Error('daemon exited'));
		const id = ++nextId;
		const t = setTimeout(() => reject(new Error(`timeout ${cmd}`)), 30000);
		pending.set(id, {
			resolve: (s) => (clearTimeout(t), resolve(s)),
			reject: (e) => (clearTimeout(t), reject(e)),
		});
		log(`-> ${cmd} ${JSON.stringify(args).slice(0, 6000)}`);
		proc.stdin!.write(JSON.stringify({ id, cmd, args }) + '\n');
	});
}

function startDaemon() {
	proc = spawn(CLI, ['daemon']);
	let buf = '';
	proc.stdout!.on('data', (d: Buffer) => {
		buf += d.toString();
		const lines = buf.split('\n');
		buf = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.trim()) continue;
			if (line.startsWith('{"id":')) {
				const m = JSON.parse(line);
				log(`<- id=${m.id} ok=${m.ok} ${m.ok ? '' : line.slice(0, 6000)}`);
				const p = pending.get(m.id);
				if (p) {
					pending.delete(m.id);
					if (m.ok) p.resolve(m.data ? JSON.stringify(m.data) : '');
					else p.reject(new Error(m.error ?? `code ${m.code}`));
				}
			} else if (/^\{"type":"ok"/.test(line)) {
				if (needAck > ackSeq) stats.acks.push(Date.now() - pendingSince);
				ackSeq++;
				log(`ev ok`);
			} else if (ECHO && /"type":"(patch_version_change|resources_used)"/.test(line)) {
				const m = JSON.parse(line);
				if (m.type === 'patch_version_change' && m.version !== 0) pendingReload.add(m.slot);
				else if (m.type === 'resources_used' && pendingReload.has(m.slot)) {
					pendingReload.delete(m.slot);
					log(`echo reload ${m.slot}`);
					void useSlotsStore().loadSlot(m.slot, true);
				}
			} else if (/device_disconnected/.test(line)) {
				disconnected++;
				if (!stats.failCtx) stats.failCtx = stats.lastCmds.join(' | ');
				log(`!!! ${line}`);
			} else if (!/led_data|volume_data|resources_used|slot_data|names/.test(line)) {
				log(`ev ${line.slice(0, 150)}`);
			}
		}
	});
	proc.stderr!.on('data', (d: Buffer) => log(`ERR ${d.toString().trim().slice(0, 300)}`));
	proc.on('close', (c) => {
		exited = true;
		log(`daemon closed ${c}`);
	});
}

async function stopDaemon() {
	if (exited) return;
	proc.kill('SIGTERM');
	for (let i = 0; i < 100 && !exited; i++) await sleep(200);
}

function installCli() {
	const toWire = (cmd: string, args: unknown[]) => (['upload-patch-data', 'upload-perf-data'].includes(cmd) ? args.map((a) => (Array.isArray(a) ? Buffer.from(a).toString('base64') : a)) : args);
	(globalThis as any).window = {
		cli: {
			run: async (a: any[]) => {
				const [cmd, ...rest] = a;
				return send(cmd, toWire(cmd, rest));
			},
			runBatch: async (list: string[][]) => {
				if (list.length === 0) return [];
				const r = list.length === 1 ? [await send(list[0][0], list[0].slice(1))] : [await send('seq', list)];
				if (DELAY && list.some((c) => c[0] === 'del-module')) await sleep(DELAY);
				return r;
			},
		},
	};
}

async function deviceState() {
	const out = JSON.parse(await send('get-patch', ['A']));
	const hex: string = out.data;
	const sec = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const nb = new TextEncoder().encode(out.name);
	const f = new Uint8Array(nb.length + 3 + sec.length);
	f.set(nb);
	f[nb.length + 1] = 0x17;
	f.set(sec, nb.length + 3);
	const { PatchParser } = await import('@/parser/nmg2PatchParser');
	return new PatchParser(f.buffer).parse() as any;
}
const sig = (p: any) => ({
	mods: p.areas[1].modules.map((m: any) => `${m.index}:${m.type}@${m.horiz},${m.vert}:${m.uname}`).sort(),
	cables: (p.areas[1].cableList ?? []).map((c: any) => `${c.smod}.${c.scon}>${c.dmod}.${c.dcon}d${c.dir ?? 1}`).sort(),
	knobs: (p.paramPages ?? []).map((k: any) => `${k.slotIndex}=${k.moduleIndex}.${k.paramIndex}`).sort(),
	lv: Object.fromEntries(p.areas[1].modules.map((m: any) => [m.index, (m.lv ?? []).join(',')])),
});
async function compare(tag: string, store: any) {
	if (!process.env.COMPARE) return;
	try {
		const dev = sig(await deviceState());
		const loc = sig(store.slots.A.patch);
		const locKnobs = store.slots.A.paramPages.map((k: any) => `${k.slotIndex}=${k.moduleIndex}.${k.paramIndex}`).sort();
		const diffs: string[] = [];
		const cmp = (n: string, a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b) && diffs.push(`${n}: dev=${JSON.stringify(a).slice(0, 300)} loc=${JSON.stringify(b).slice(0, 300)}`);
		cmp('mods', dev.mods, loc.mods);
		cmp('cables', dev.cables, loc.cables);
		cmp('knobs', dev.knobs, locKnobs);
		const extractVariations = (await import('@/store/slotHelpers')).extractVariations;
		void extractVariations;
		log(`CMP ${tag}: ${diffs.length ? 'DIFF ' + diffs.join(' || ') : 'same'}`);
	} catch (e: any) {
		log(`CMP ${tag} failed ${e.message}`);
	}
}

const ENABLED = !!process.env.HW;
const CYCLES = Number(process.env.CYCLES ?? 10);
const STEP_MS = Number(process.env.STEP_MS ?? 400);
const FROM = Number(process.env.FROM ?? 7); // OscB
const TO = Number(process.env.TO ?? 163); // OscShpA

describe.skipIf(!ENABLED)('hardware: replaceModule undo/redo', () => {
	beforeAll(async () => {
		fs.writeFileSync(LOG, '');
		fs.rmSync('/tmp/w/hw.result', { force: true });
		startDaemon();
		installCli();
		await sleep(8000);
	}, 30000);
	afterAll(async () => {
		await stopDaemon();
	}, 60000);

	it('cycles', async () => {
		setActivePinia(createPinia());
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Connected;
		useUiStore().slotInFocus = 'A';
		const hist = useHistoryStore();

		await send('upload-patch', ['A', FIX]);
		await sleep(4000);
		for (let i = 0; i < 8 && !(await store.loadSlot('A')); i++) await sleep(2500);
		if (!store.slots.A.patch) throw new Error('SETUP: no patch');
		log(`loaded modules=${store.slots.A.patch!.areas[1].modules.length}`);

		const def = getModule(FROM)!;
		const idx = (n: string) => def.inputs!.findIndex((i) => i.name === n);
		if (!process.env.FIXTURE) {
		await store.addModule(1, 12, 0, 0, 'voice');
		await store.addModule(FROM, 13, 1, 0, 'voice');
		await store.addModule(4, 16, 2, 0, 'voice');
		await store.addCable(12, 1, 0, 13, 0, idx('Pitch'), 'voice', 1);
		const fm = idx('FmMod') >= 0 ? idx('FmMod') : 3;
		await store.addCable(12, 1, 1, 13, 0, fm, 'voice', 1);
		await store.addCable(13, 1, 0, 16, 0, 0, 'voice', 1);
		await store.assignParamToPage('A', 24, 1, 13, 0);
		await store.assignParamToPage('A', 25, 1, 13, 1);
		const n = def.params!.length;
		for (let v = 1; v < 9; v++) await store.setParams(13, Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => (i * 7 + v * 5) % 100), v, 'voice');
		}
		if (process.env.EDITS && process.env.FIXTURE) {
			const m = store.slots.A.patch!.areas[1].modules.find((x) => x.index === TID)!;
			await store.setParam(TID, 0, 55, 2, 'voice', true);
			await store.setParam(TID, 1, 44, 4, 'voice');
			await sleep(300);
			const cb = store.slots.A.patch!.areas[1].cableList!.find((c) => c.dmod === TID);
			if (cb) await store.setCableColor(TID, cb.dcon, 'input', 4, 'voice');
			log(`fixture target ${m.index} type ${m.type} pcnt ${m.pcnt}`);
		} else if (process.env.EDITS) {
			// edits before replacing: more cables, param changes in several variations, cable deletion, color
			await store.addCable(12, 1, 2, 13, 0, idx('Sync') >= 0 ? idx('Sync') : 2, 'voice', 2);
			await store.setParam(13, 2, 99, 0, 'voice', true);
			await store.setParam(13, 3, 11, 3, 'voice', true);
			await store.setParam(13, 0, 77, 5, 'voice');
			await sleep(300);
			await store.setCableColor(16, 0, 'input', 4, 'voice');
			await store.deleteConnectedCables(13, 2, 'input', 'voice');
			await store.addCable(12, 1, 3, 16, 0, 1, 'voice', 3);
			await store.setModuleLabel(13, 'OSC 1', 'voice');
			await sleep(300);
		}
		await compare('scene', store);
		hist.clearHistory('A');
		await sleep(1000);
		log(`scene built, disconnected=${disconnected}`);
		if (process.env.COMPARE && /CMP scene failed/.test(fs.readFileSync(LOG, 'utf8'))) fs.writeFileSync('/tmp/w/hw.setupwedge', stats.lastCmds.join(' | '));

		const step = async (name: string, fn: () => Promise<unknown>) => {
			log(`=== ${name}`);
			try {
				await fn();
			} catch (e: any) {
				log(`step ${name} threw ${e.message}`);
			}
			await sleep(STEP_MS);
			await compare(name, store);
			if (disconnected) throw new Error(`DISCONNECT during/after ${name}`);
		};
		const results: string[] = [];
		for (let c = 1; c <= CYCLES; c++) {
			try {
				await step(`c${c} replace`, () => store.replaceModule(TID, TO, 'voice'));
				await step(`c${c} undo`, () => store.undo());
				await step(`c${c} redo`, () => store.redo());
				await step(`c${c} undo2`, () => store.undo());
				results.push(`c${c} ok`);
			} catch (e: any) {
				results.push(`c${c} ${e.message}`);
				break;
			}
		}
		log(`RESULT ${results.join(' | ')}`);
		fs.writeFileSync('/tmp/w/hw.result', results.join('\n'));
		fs.writeFileSync('/tmp/w/hw.stats', JSON.stringify(stats));
	}, 600000);
});
