import fs from 'fs';
import type { TestProject } from 'vitest/node';
import { CLI_PATH, g2Count, runningDaemons, waitFor } from '../e2e-duration/lib/cli';

/*
 * Needs a G2 that is switched on: the suite never switches the Shelly plug (only the duration test does).
 * No G2: fails with NOT RUN like the CLI integration runners, or skips every test with G2_ALLOW_NO_DEVICE=1.
 */

declare module 'vitest' {
	interface ProvidedContext {
		g2: boolean;
	}
}

// A G2 that was just switched on enumerates after ~6 s (2026-10-20).
const ENUMERATE_TIMEOUT_MS = 10_000;

export default async function setup(project: TestProject): Promise<void> {
	if (!fs.existsSync(CLI_PATH)) throw new Error(`${CLI_PATH} missing: cd cli && make && cd ../g2-editor && npm run postinstall`);
	const others = runningDaemons();
	if (others.length) throw new Error(`Another g2-cli daemon is running (close the editor first):\n${others.join('\n')}`);

	const noDevice = (why: string) => {
		if (process.env.G2_ALLOW_NO_DEVICE !== '1') throw new Error(`NOT RUN: ${why} (G2_ALLOW_NO_DEVICE=1 to skip)`);
		project.provide('g2', false);
	};

	if (await waitFor(async () => (await g2Count()) > 0, ENUMERATE_TIMEOUT_MS, 2000)) project.provide('g2', true);
	else noDevice('no G2 detected (switch it on first)');
}
