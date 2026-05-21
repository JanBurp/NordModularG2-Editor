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

	test('switching variations after loading a patch', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);

		// Variation 1 (index 0) is active by default
		await expect(page.locator('[data-testid="variation-0"]')).toHaveClass(/btn-active/);

		// Switch to variation 2
		await page.locator('[data-testid="variation-1"]').click();
		await page.waitForTimeout(200);
		await expect(page.locator('[data-testid="variation-1"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="variation-0"]')).not.toHaveClass(/btn-active/);

		// Switch to variation 3
		await page.locator('[data-testid="variation-2"]').click();
		await page.waitForTimeout(200);
		await expect(page.locator('[data-testid="variation-2"]')).toHaveClass(/btn-active/);

		// Switch to INIT (index 8)
		await page.locator('[data-testid="variation-8"]').click();
		await page.waitForTimeout(200);
		await expect(page.locator('[data-testid="variation-8"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="variation-2"]')).not.toHaveClass(/btn-active/);
	});

	test('switching slots after loading a performance', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('MorphingDrumDemo.prf2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);

		// Slot A is active by default
		await expect(page.locator('[data-testid="slot-0"]')).toHaveClass(/btn-active/);
		const countsA = await getStatusCounts(page);
		expect(countsA.voiceModules + countsA.fxModules).toBeGreaterThan(0);

		// Switch to slot B
		await page.locator('[data-testid="slot-1"]').click();
		await page.waitForTimeout(300);
		await expect(page.locator('[data-testid="slot-1"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="slot-0"]')).not.toHaveClass(/btn-active/);

		// Switch to slot C
		await page.locator('[data-testid="slot-2"]').click();
		await page.waitForTimeout(300);
		await expect(page.locator('[data-testid="slot-2"]')).toHaveClass(/btn-active/);

		// Switch back to slot A
		await page.locator('[data-testid="slot-0"]').click();
		await page.waitForTimeout(300);
		await expect(page.locator('[data-testid="slot-0"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="slot-2"]')).not.toHaveClass(/btn-active/);
	});
});
