import type { ElectronApplication, Page } from '@playwright/test';
import { test as base, _electron as electron } from '@playwright/test';

import fs from 'fs';
import os from 'os';
import path from 'path';

const APP_ROOT = path.join(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', 'test-patches');

// Under heavy parallel load (many Electron instances launching at once), the CDP
// connection backing app.evaluate() can be transiently unstable right after launch,
// surfacing as either "Execution context was destroyed, most likely because of a
// navigation" or "Resulting promise was garbage collected". Retry a few times rather
// than failing the test on this transient race.
const TRANSIENT_EVALUATE_ERRORS = ['Execution context was destroyed', 'Resulting promise was garbage collected'];

// Hard cap on the whole retry loop, on top of the attempt count (each attempt can itself be slow).
const EVALUATE_RETRY_TIMEOUT_MS = 10_000;

export async function evaluateWithRetry<R, Arg = void>(
	app: ElectronApplication,
	fn: (electron: typeof import('electron'), arg: Arg) => R,
	arg?: Arg,
): Promise<R> {
	const deadline = Date.now() + EVALUATE_RETRY_TIMEOUT_MS;
	for (let attempt = 1; ; attempt++) {
		try {
			// Playwright types the argument as Unboxed<Arg>, which TS can't relate to a free Arg; it is the same value at runtime.
			return await app.evaluate(fn as (electron: typeof import('electron'), arg: any) => R, arg as Arg);
		} catch (e) {
			if (attempt >= 5 || Date.now() > deadline || !(e instanceof Error) || !TRANSIENT_EVALUATE_ERRORS.some((m) => e.message.includes(m))) throw e;
			await new Promise((r) => setTimeout(r, 100));
		}
	}
}

export type AppFixtures = {
	app: ElectronApplication;
	page: Page;
	sendMenuAction: (action: string) => Promise<void>;
	mockOpenPatch: (filename: string) => Promise<void>;
	mockSaveDialog: () => Promise<string>;
	mockSavePerfDialog: () => Promise<string>;
};

export const test = base.extend<AppFixtures>({
	app: async ({ }, use) => {
		const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-'));
		const app = await electron.launch({
			args: [APP_ROOT],
			env: {
				...process.env,
				VITE_DEV_OFFLINE: 'true',
				NODE_ENV: 'test',
				HEADLESS: '1',
				TEST_USER_DATA: testUserData,
			},
		});

		// Wait for the window's initial navigation to settle before stubbing handlers,
		// preventing "Execution context was destroyed" race with page load.
		await (await app.firstWindow()).waitForLoadState('domcontentloaded');

		// Stub out CLI handlers so no binary is needed
		await evaluateWithRetry(app, ({ ipcMain }) => {
			for (const ch of ['cli:run', 'cli:run-batch']) {
				ipcMain.removeHandler(ch);
				ipcMain.handle(ch, async () => '');
			}
			ipcMain.removeHandler('cli:watch-start');
			ipcMain.handle('cli:watch-start', async () => { });
		});

		await use(app);
		await app.close();
		fs.rmSync(testUserData, { recursive: true, force: true });
	},

	page: async ({ app }, use) => {
		const page = await app.firstWindow();
		await page.waitForLoadState('domcontentloaded');
		await page.waitForSelector('[data-testid="connection-status"]');
		await use(page);
	},

	// Depends on `page` so the renderer has mounted (and registered its menu:action listener)
	// before any action is sent; otherwise a hook requesting only sendMenuAction races the mount.
	sendMenuAction: async ({ app, page: _page }, use) => {
		const fn = async (action: string) => {
			await evaluateWithRetry(app, ({ BrowserWindow }, act) => {
				const win = BrowserWindow.getAllWindows()[0];
				win?.webContents.send('menu:action', act);
			}, action);
		};
		await use(fn);
	},

	mockOpenPatch: async ({ app }, use) => {
		const fn = async (filename: string) => {
			// Open a temp copy so tests that save in place never rewrite the checked-in fixture.
			const userDataDir = await app.evaluate(() => process.env.TEST_USER_DATA as string);
			const filepath = path.join(userDataDir, filename);
			fs.copyFileSync(path.join(FIXTURES_DIR, filename), filepath);
			const data = Array.from(fs.readFileSync(filepath));
			await evaluateWithRetry(app, ({ ipcMain }, args) => {
				ipcMain.removeHandler('patch:open-dialog');
				ipcMain.handle('patch:open-dialog', async () => ({
					success: true,
					filepath: args.filepath,
					data: args.data,
				}));
			}, { filepath, data });
		};
		await use(fn);
	},

	mockSaveDialog: async ({ app }, use) => {
		let savedPath = '';
		const fn = async () => {
			savedPath = path.join(os.tmpdir(), `g2-test-${Date.now()}.pch2`);
			await evaluateWithRetry(app, ({ ipcMain }, sp) => {
				ipcMain.removeHandler('patch:save-dialog');
				ipcMain.handle('patch:save-dialog', async () => ({ success: true, filepath: sp }));
			}, savedPath);
			return savedPath;
		};
		await use(fn);
		if (savedPath && fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
	},

	mockSavePerfDialog: async ({ app }, use) => {
		let savedPath = '';
		const fn = async () => {
			savedPath = path.join(os.tmpdir(), `g2-test-${Date.now()}.prf2`);
			await evaluateWithRetry(app, ({ ipcMain }, sp) => {
				ipcMain.removeHandler('perf:save-dialog');
				ipcMain.handle('perf:save-dialog', async () => ({ success: true, filepath: sp }));
			}, savedPath);
			return savedPath;
		};
		await use(fn);
		if (savedPath && fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
	},
});

export { expect } from '@playwright/test';
