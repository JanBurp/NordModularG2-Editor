import { test as base, _electron as electron, type ElectronApplication } from '@playwright/test';
import { expect, evaluateWithRetry } from './fixtures/electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Deliberately does NOT reuse fixtures/electron's shared `test` — that fixture always launches
// with VITE_DEV_OFFLINE=true, which makes App.vue skip the entire device-discovery flow this
// spec exercises. These tests launch their own Electron instance(s) without that flag instead.
const APP_ROOT = path.join(__dirname, '..');

type FakeDevice = { bus: number; device: number };

// Stubs the same "no daemon/binary needed" IPC channels the shared fixture stubs (cli:run,
// cli:run-batch, cli:watch-start), plus devices:list so App.vue's startup flow sees a
// controlled set of "connected G2s" instead of the real (hardware-less, in CI) result.
async function stubDeviceDiscovery(app: ElectronApplication, devices: FakeDevice[]): Promise<void> {
	await evaluateWithRetry(app, ({ ipcMain }, devs) => {
		for (const ch of ['cli:run', 'cli:run-batch']) {
			ipcMain.removeHandler(ch);
			ipcMain.handle(ch, async () => '');
		}
		ipcMain.removeHandler('cli:watch-start');
		ipcMain.handle('cli:watch-start', async () => {
			// Deliberately does not emit watch_armed — connectDevice()'s 8s timeout is allowed
			// to fire in the background; these tests only assert on state that's settled well
			// before then (window count), not on a reached "Connected" status.
		});

		ipcMain.removeHandler('devices:list');
		ipcMain.handle('devices:list', async () => devs.map((d) => ({ bus: d.bus, device: d.device, id: `${d.bus}:${d.device}`, alreadyConnected: false })));
	}, devices);
}

async function launchApp(testUserData: string): Promise<ElectronApplication> {
	return electron.launch({
		args: [APP_ROOT],
		env: { ...process.env, NODE_ENV: 'test', HEADLESS: '1', TEST_USER_DATA: testUserData },
	});
}

const test = base.extend<{ userDataDir: string }>({
	userDataDir: async ({}, use) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-multi-'));
		await use(dir);
		fs.rmSync(dir, { recursive: true, force: true });
	},
});

test.describe('multi-device — one BrowserWindow per connected G2', () => {
	test('exactly one unclaimed device auto-binds', async ({ userDataDir }) => {
		const app = await launchApp(userDataDir);
		try {
			const page = await app.firstWindow();
			await page.waitForLoadState('domcontentloaded');
			await stubDeviceDiscovery(app, [{ bus: 2, device: 1 }]);
			// The real onMounted flow may have already run against the unstubbed handler before
			// the stub landed; reload so this run observes it.
			await page.reload();
			await page.waitForLoadState('domcontentloaded');
			await page.waitForSelector('[data-testid="connection-status"]');

			await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
		} finally {
			await app.close();
		}
	});

	test('multiple unclaimed devices: auto-binds to the first one (no picker)', async ({ userDataDir }) => {
		const app = await launchApp(userDataDir);
		try {
			const page = await app.firstWindow();
			await page.waitForLoadState('domcontentloaded');
			await stubDeviceDiscovery(app, [
				{ bus: 2, device: 1 },
				{ bus: 0, device: 7 },
			]);
			await page.reload();
			await page.waitForLoadState('domcontentloaded');
			await page.waitForSelector('[data-testid="connection-status"]');

			// No dialog anywhere — the first candidate is bound automatically.
			await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
		} finally {
			await app.close();
		}
	});

	// The explicit ask this fixes: two windows are two independent renderer processes with their
	// own Pinia state, so a copy in one is invisible to the other unless routed through the real
	// OS clipboard (see usePatchClipboard.ts / electron/main.ts's clipboard:write/read).
	test('copy in one window is readable via paste in a second, independent window (real OS clipboard round-trip)', async () => {
		const dataA = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-multi-a-'));
		const dataB = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-multi-b-'));
		const appA = await launchApp(dataA);
		const appB = await launchApp(dataB);
		try {
			const pageA = await appA.firstWindow();
			const pageB = await appB.firstWindow();
			await pageA.waitForLoadState('domcontentloaded');
			await pageB.waitForLoadState('domcontentloaded');

			const entry = {
				modules: [{ index: 0, type: 1, horiz: 0, vert: 0, lv: [0, 0], modes: [0] }],
				cables: [],
				area: 'va',
				copiedVariation: 0,
			};
			await pageA.evaluate((e) => window.electronAPI.clipboard.write(e), entry);

			const readBack = await pageB.evaluate(() => window.electronAPI.clipboard.read());
			expect(readBack).toEqual(entry);
		} finally {
			await appA.close();
			await appB.close();
			fs.rmSync(dataA, { recursive: true, force: true });
			fs.rmSync(dataB, { recursive: true, force: true });
		}
	});
});
