import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures/electron';

// These are the one place main.ts's real "patches:init-save-path"/"patches:init-load-path"
// handlers run unmocked - the e2e fixture only stubs cli:run/cli:run-batch/cli:watch-start,
// so this exercises the actual userData path resolution and fallback logic, not a mock.
test.describe('file operations – save/load init patch', () => {
	test('Save Init Patch 1 writes the focused slot to userData, and the Init 1 button loads it back', async ({ app, page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		await sendMenuAction('save-init-1');
		await page.waitForTimeout(500);

		const userDataDir = await app.evaluate(() => process.env.TEST_USER_DATA as string);
		const initPath = path.join(userDataDir, 'patches', 'init-1.pch2');
		expect(fs.existsSync(initPath)).toBe(true);
		expect(fs.statSync(initPath).size).toBeGreaterThan(0);

		// Load a different patch, then load Init 1 back via the toolbar button.
		await mockOpenPatch('DXBass FM4.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		await page.getByRole('button', { name: 'Init 1' }).click();
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
	});

	test('Init 2 falls back to the bundled EmptyPatch.pch2 when no snapshot has been saved yet', async ({ app, page }) => {
		const userDataDir = await app.evaluate(() => process.env.TEST_USER_DATA as string);
		const initPath = path.join(userDataDir, 'patches', 'init-2.pch2');
		expect(fs.existsSync(initPath)).toBe(false);

		await page.getByRole('button', { name: 'Init 2' }).click();
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// Loading only ever reads the fallback path - it must not create init-2.pch2 as a side effect.
		expect(fs.existsSync(initPath)).toBe(false);
	});
});
