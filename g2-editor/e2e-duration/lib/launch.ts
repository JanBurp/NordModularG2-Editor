import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { EventLog } from './eventLog';
import { editorPage } from '../../e2e/fixtures/electron';

const APP_ROOT = path.join(__dirname, '..', '..');

// High-volume streaming events that would bloat the log without helping diagnosis.
const NOISE = /led_data|volume_data|"type":"vu/;

function tee(stream: NodeJS.ReadableStream | null | undefined, log: EventLog, kind: 'main' | 'daemon'): void {
	let buf = '';
	stream?.on('data', (chunk: Buffer) => {
		buf += chunk.toString();
		const lines = buf.split('\n');
		buf = lines.pop() ?? '';
		for (const line of lines) if (line.trim() && !NOISE.test(line)) log.log(kind, { line: line.slice(0, 600) });
	});
}

export interface Launched {
	app: ElectronApplication;
	page: Page;
	cleanup: () => Promise<void>;
}

/** Launches the real built app (no VITE_DEV_OFFLINE, no IPC stubs): real daemon, real G2. Main-process output and renderer warnings are teed into the event log. */
export async function launchReal(log: EventLog): Promise<Launched> {
	const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-duration-'));
	const app = await electron.launch({
		args: [APP_ROOT],
		env: { ...process.env, NODE_ENV: 'test', HEADLESS: process.env.DURATION_HEADED ? '' : '1', TEST_USER_DATA: userData } as Record<string, string>,
	});
	const proc = app.process();
	tee(proc.stdout, log, 'main');
	tee(proc.stderr, log, 'daemon');
	app.on('close', () => log.log('main', { line: '[duration-test] Electron app closed' }));

	const page = await editorPage(app);
	page.on('console', (m) => {
		if (m.type() === 'warning' || m.type() === 'error') log.log('console', { line: m.text().slice(0, 600) });
	});
	page.on('crash', () => log.log('error', { line: 'renderer crashed' }));
	await page.waitForLoadState('domcontentloaded');
	await page.waitForSelector('[data-testid="connection-status"]', { timeout: 30_000 });

	return {
		app,
		page,
		cleanup: async () => {
			await app.close().catch(() => undefined);
			fs.rmSync(userData, { recursive: true, force: true });
		},
	};
}
