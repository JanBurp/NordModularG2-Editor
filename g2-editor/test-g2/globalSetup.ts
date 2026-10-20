import fs from 'fs';
import type { TestProject } from 'vitest/node';
import { CLI_PATH, g2Count, runningDaemons, sleep, waitFor } from '../e2e-duration/lib/cli';
import { shelly } from '../e2e-duration/lib/shelly';

/*
 * Powers the G2 on via the Shelly plug before the suite and always off afterwards (also when tests fail;
 * Ctrl-C may skip the teardown: then run `scripts/shelly off` by hand).
 * No G2: fails with NOT RUN like the CLI integration runners, or skips every test with G2_ALLOW_NO_DEVICE=1.
 */

declare module 'vitest' {
	interface ProvidedContext {
		g2: boolean;
	}
}

// A powered-on G2 enumerated after ~6 s in every run (2026-10-20); 120 s (shelly.ts) is for a spontaneous reboot.
const ENUMERATE_TIMEOUT_MS = 30_000;
// Memory note: the G2 needs ~25 s after a power reset before it answers reliably.
const SETTLE_MS = 25_000;

export default async function setup(project: TestProject): Promise<(() => Promise<void>) | undefined> {
	if (!fs.existsSync(CLI_PATH)) throw new Error(`${CLI_PATH} missing: cd cli && make && cd ../g2-editor && npm run postinstall`);
	const others = runningDaemons();
	if (others.length) throw new Error(`Another g2-cli daemon is running (close the editor first):\n${others.join('\n')}`);

	const noDevice = (why: string) => {
		if (process.env.G2_ALLOW_NO_DEVICE !== '1') throw new Error(`NOT RUN: ${why} (G2_ALLOW_NO_DEVICE=1 to skip)`);
		project.provide('g2', false);
	};

	const wasOn = (await g2Count()) > 0;
	try {
		await shelly('on');
	} catch (e) {
		noDevice(String(e));
		return undefined;
	}
	const off = () => shelly('off').catch((e) => console.error(`could not switch the G2 off: ${e}`));
	try {
		if (!(await waitFor(async () => (await g2Count()) > 0, ENUMERATE_TIMEOUT_MS, 2000))) noDevice('no G2 detected');
		else {
			if (!wasOn) await sleep(SETTLE_MS);
			project.provide('g2', true);
		}
	} catch (e) {
		await off();
		throw e;
	}
	return off;
}
