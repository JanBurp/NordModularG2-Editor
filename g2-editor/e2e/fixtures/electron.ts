import type { ElectronApplication, Page } from '@playwright/test';
import { test as base, _electron as electron } from '@playwright/test';

import fs from 'fs';
import os from 'os';
import path from 'path';

const APP_ROOT = path.join(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', 'test-patches');

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
		await app.evaluate(({ ipcMain }) => {
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

	sendMenuAction: async ({ app }, use) => {
		const fn = async (action: string) => {
			await app.evaluate(({ BrowserWindow }, act) => {
				const win = BrowserWindow.getAllWindows()[0];
				win?.webContents.send('menu:action', act);
			}, action);
		};
		await use(fn);
	},

	mockOpenPatch: async ({ app }, use) => {
		const fn = async (filename: string) => {
			const filepath = path.join(FIXTURES_DIR, filename);
			const data = Array.from(fs.readFileSync(filepath));
			await app.evaluate(({ ipcMain }, args) => {
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
			await app.evaluate(({ ipcMain }, sp) => {
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
			await app.evaluate(({ ipcMain }, sp) => {
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
