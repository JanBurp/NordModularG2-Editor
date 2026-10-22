import { execFile, execFileSync } from 'child_process';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
export const CLI_PATH = path.join(REPO_ROOT, 'g2-editor', 'resources', 'g2-cli');
export const SHELLY_PATH = path.join(REPO_ROOT, 'scripts', 'shelly');

/** One-shot `g2-cli --json <args>`; resolves with the parsed JSON (or the raw string when it is not JSON). */
export function runCli(args: string[], timeoutMs = 300_000): Promise<any> {
	return new Promise((resolve, reject) => {
		execFile(CLI_PATH, ['--json', ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) return reject(new Error(`g2-cli ${args.join(' ')} failed: ${err.message}\n${stdout}${stderr}`.trim()));
			try {
				resolve(JSON.parse(stdout));
			} catch {
				resolve(stdout);
			}
		});
	});
}

/** `bus:device` of every G2 on USB (empty when there is none or list-devices failed). */
export async function g2Addresses(): Promise<string[]> {
	try {
		const all: { bus: number; device: number; isG2: boolean }[] = (await runCli(['list-devices'], 20_000)).all ?? [];
		return all.filter((d) => d.isG2).map((d) => `${d.bus}:${d.device}`);
	} catch {
		return [];
	}
}

export async function g2Count(): Promise<number> {
	return (await g2Addresses()).length;
}

/** Another daemon (e.g. a dev editor) would fight the test for the USB interface. */
export function runningDaemons(): string[] {
	try {
		return execFileSync('pgrep', ['-fl', 'g2-cli daemon'], { encoding: 'utf8' }).split('\n').filter(Boolean);
	} catch {
		return []; // pgrep exits 1 when nothing matches
	}
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function waitFor(cond: () => Promise<boolean> | boolean, timeoutMs: number, pollMs = 1000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await cond()) return true;
		await sleep(pollMs);
	}
	return false;
}

export interface G2Snapshot {
	mode: string;
	performance?: string;
	slots: { slot: string; name: string; bank: number; patch: number }[];
	patchBanks: Record<string, { location: number; name: string }[]>;
	perfBanks: Record<string, { location: number; name: string }[]>;
}

/** Whatever state the G2 is in right now: mode, slot patches and the bank listing. Used both as report header and as the pool of load targets. */
export async function snapshotG2(): Promise<G2Snapshot> {
	const startup = await runCli(['startup']);
	const list = await runCli(['list']);
	return {
		mode: startup.device?.mode ?? 'unknown',
		performance: startup.device?.performance?.name,
		slots: (startup.device?.slots ?? []).map((s: any) => ({ slot: s.slot, name: s.name, bank: s.bank, patch: s.patch })),
		patchBanks: list.patches ?? {},
		perfBanks: list.performances ?? {},
	};
}

/** What is wrong with a bank listing: a location listed twice in a bank means the list replies got out of step (seen 2026-10-06). */
export function bankListProblems(snap: Pick<G2Snapshot, 'patchBanks' | 'perfBanks'>): string[] {
	const out: string[] = [];
	for (const [kind, banks] of [['patch', snap.patchBanks], ['performance', snap.perfBanks]] as const) {
		for (const [bank, list] of Object.entries(banks)) {
			const dup = list.length - new Set(list.map((e) => e.location)).size;
			if (dup) out.push(`${kind} bank ${bank}: ${dup} of ${list.length} entries repeat a location`);
		}
	}
	return out;
}
