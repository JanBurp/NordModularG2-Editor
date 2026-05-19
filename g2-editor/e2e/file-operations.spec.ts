import fs from 'fs';
import { test, expect } from './fixtures/electron';
import { getStatusCounts } from './helpers';

test.describe('file operations – offline', () => {
	test('load a .pch2 patch file', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);

		// Patch toolbar should show a patch name
		await expect(page.getByText(/Patch:/)).toBeVisible();

		// Canvas voice area should be visible
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// Status bar should report at least one module
		const counts = await getStatusCounts(page);
		expect(counts.voiceModules + counts.fxModules).toBeGreaterThan(0);
	});

	test('load a .prf2 performance file', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('MorphingDrumDemo.prf2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);

		// Performance name shown in toolbar
		await expect(page.getByText('MorphingDrumDemo')).toBeVisible();

		// The "Perf" toggle button becomes active when device.mode === 'Performance'
		const perfBtn = page.getByRole('button', { name: 'Perf' });
		await expect(perfBtn).toHaveClass(/btn-active/);

		// Canvas has modules
		const counts = await getStatusCounts(page);
		expect(counts.voiceModules + counts.fxModules).toBeGreaterThan(0);
	});

	test('save-as writes a file to the mocked path', async ({ page, sendMenuAction, mockOpenPatch, mockSaveDialog }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);

		const savedPath = await mockSaveDialog();
		await sendMenuAction('save-as');
		await page.waitForTimeout(500);

		expect(fs.existsSync(savedPath)).toBe(true);
		expect(fs.statSync(savedPath).size).toBeGreaterThan(0);
	});

	test('save (Ctrl+S) writes to existing path', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);

		// save without dialog uses templateRawHex path; verify no crash
		await sendMenuAction('save');
		await page.waitForTimeout(300);
	});
});
