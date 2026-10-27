import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { expect, editorPage, evaluateWithRetry } from './fixtures/electron';
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
	await evaluateWithRetry(
		app,
		({ ipcMain }, devs) => {
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
			ipcMain.handle('devices:list', async () =>
				devs.map((d) => ({ bus: d.bus, device: d.device, id: `${d.bus}:${d.device}`, alreadyConnected: false })),
			);
		},
		devices,
	);
}

async function launchApp(testUserData: string): Promise<ElectronApplication> {
	return electron.launch({
		args: [APP_ROOT],
		env: { ...process.env, NODE_ENV: 'test', HEADLESS: '1', TEST_USER_DATA: testUserData, G2_HIDE_DEVICES: '1' },
	});
}

const test = base.extend<{ userDataDir: string }>({
	userDataDir: async ({}, use) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-multi-'));
		await use(dir);
		fs.rmSync(dir, { recursive: true, force: true });
	},
});

// Launches with one stubbed G2 bound to the first device view (reload: the real onMounted flow
// may have run before the stub landed, against no devices: G2_HIDE_DEVICES).
async function launchWithOneDevice(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
	const app = await launchApp(userDataDir);
	const page = await editorPage(app);
	await page.waitForLoadState('domcontentloaded');
	await stubDeviceDiscovery(app, [{ bus: 2, device: 1 }]);
	await page.reload();
	await page.waitForLoadState('domcontentloaded');
	await page.waitForSelector('[data-testid="connection-status"]');
	return { app, page };
}

// A second G2 found by the hot-plug scan; returns its view's page.
async function addSecondDevice(app: ElectronApplication, first: Page): Promise<Page> {
	await app.evaluate(() => (globalThis as any).__g2AddDevice(250, 2));
	await expect.poll(() => app.windows().filter((p) => p !== first && /index\.html|^https?:/.test(p.url())).length).toBe(1);
	const second = app.windows().find((p) => p !== first && /index\.html|^https?:/.test(p.url()))!;
	await second.waitForSelector('[data-testid="connection-status"]');
	return second;
}

// The stubbed daemon never arms: wait out the connect attempt (its loading overlay), then close
// the "G2 not connected" splash a view may show, so both stop covering the toolbar.
async function settle(page: Page): Promise<void> {
	await expect(page.locator('[data-testid="connection-status"]')).not.toContainText('connecting', { timeout: 20_000 });
	const close = page.getByRole('button', { name: 'Close', exact: true }).last();
	if (await close.isVisible()) await close.click();
}

const windowCount = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const groupStates = (page: Page) => page.locator('[data-testid="device-group"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-active')));

test.describe('multi-device — one window, a device group per connected G2', () => {
	test('one device: one window with one active device group', async ({ userDataDir }) => {
		const { app, page } = await launchWithOneDevice(userDataDir);
		try {
			await expect.poll(() => windowCount(app)).toBe(1);
			await expect.poll(() => groupStates(page)).toEqual(['true']);
		} finally {
			await app.close();
		}
	});

	test('a second device joins the same window as an inactive group, in the same order in both views', async ({ userDataDir }) => {
		const { app, page } = await launchWithOneDevice(userDataDir);
		try {
			const second = await addSecondDevice(app, page);
			expect(await windowCount(app)).toBe(1);
			await expect.poll(() => groupStates(page)).toEqual(['true', 'false']);
			await expect.poll(() => groupStates(second)).toEqual(['false', 'true']);
		} finally {
			await app.close();
		}
	});

	test("clicking another device's slot switches to it and focuses that slot there", async ({ userDataDir }) => {
		const { app, page } = await launchWithOneDevice(userDataDir);
		try {
			const second = await addSecondDevice(app, page);
			await expect.poll(() => groupStates(page)).toEqual(['true', 'false']);
			await settle(page);
			await page.locator('[data-testid="device-group"][data-active="false"]').getByRole('button', { name: 'C', exact: true }).click();
			await expect(second.locator('[data-testid="slot-2"]')).toHaveClass(/btn-active/);
		} finally {
			await app.close();
		}
	});

	test('a device moves to a window of its own and back', async ({ userDataDir }) => {
		const { app, page } = await launchWithOneDevice(userDataDir);
		try {
			const second = await addSecondDevice(app, page);
			await expect.poll(() => groupStates(page)).toEqual(['true', 'false']);
			await settle(page);
			await page.locator('[data-testid="device-group"][data-active="false"] [data-testid="device-name"]').click({ button: 'right' });
			await page.getByText('Open in Separate Window').click();
			await expect.poll(() => windowCount(app)).toBe(2);
			// Same order in both windows.
			await expect.poll(() => groupStates(page)).toEqual(['true', 'false']);
			await expect.poll(() => groupStates(second)).toEqual(['false', 'true']);

			await settle(second);
			await second.locator('[data-testid="device-group"][data-active="true"] [data-testid="device-name"]').click({ button: 'right' });
			await second.getByText('Move to Main Window').click();
			await expect.poll(() => windowCount(app)).toBe(1);
		} finally {
			await app.close();
		}
	});

	// Two views are two independent renderer processes with their own Pinia state, so a copy in
	// one is invisible to the other unless routed through the real OS clipboard (see
	// usePatchClipboard.ts / electron/main.ts's clipboard:write/read).
	test('copy in one app is readable via paste in a second, independent one (real OS clipboard round-trip)', async () => {
		const dataA = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-multi-a-'));
		const dataB = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-test-multi-b-'));
		const appA = await launchApp(dataA);
		const appB = await launchApp(dataB);
		try {
			const pageA = await editorPage(appA);
			const pageB = await editorPage(appB);
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
