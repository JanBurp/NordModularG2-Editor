import { execFile } from 'child_process';
import { g2Count, SHELLY_PATH, sleep, waitFor } from './cli';

export function shelly(cmd: 'on' | 'off'): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(SHELLY_PATH, [cmd], { timeout: 15_000 }, (err, _out, stderr) => (err ? reject(new Error(`shelly ${cmd}: ${err.message} ${stderr}`)) : resolve()));
	});
}

/** Fails fast (before a 4 h run) when the plug is unreachable. Leaves the G2 powered on. */
export const shellyPreflight = () => shelly('on');

const OFF_MS = 5_000;
const ENUMERATE_TIMEOUT_MS = 120_000;
// Memory note: the G2 needs ~25 s after a power reset before it answers reliably.
const SETTLE_MS = 25_000;

/** Power-cycles the G2 via the Shelly plug and waits until it enumerates on USB and has settled. Returns false when it never came back. */
export async function powerCycle(): Promise<boolean> {
	await shelly('off');
	await sleep(OFF_MS);
	await shelly('on');
	if (!(await waitFor(async () => (await g2Count()) > 0, ENUMERATE_TIMEOUT_MS, 2000))) return false;
	await sleep(SETTLE_MS);
	return true;
}
