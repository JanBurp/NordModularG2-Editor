import fs from 'fs';
import { test, expect } from './fixtures/electron';
import { getStatusCounts } from './helpers';

test.describe('file operations – offline', () => {
	test('load a .pch2 patch file', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// Patch toolbar is loaded (label hidden at 800px viewport; variation buttons are always visible)
		await expect(page.locator('[data-testid="variation-0"]')).toBeVisible();

		// Status bar should report at least one module
		const counts = await getStatusCounts(page);
		expect(counts.voiceModules + counts.fxModules).toBeGreaterThan(0);
	});

	test('load a .prf2 performance file', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('MorphingDrumDemo.prf2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

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
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const savedPath = await mockSaveDialog();
		await sendMenuAction('save-as');
		await page.waitForTimeout(500);

		expect(fs.existsSync(savedPath)).toBe(true);
		expect(fs.statSync(savedPath).size).toBeGreaterThan(0);
	});

	test('save (Ctrl+S) writes to existing path', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// save without dialog uses templateRawHex path; verify no crash
		await sendMenuAction('save');
	});

	test('switching variations after loading a patch', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('-- Welcome G2 --.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// Variation 1 (index 0) is active by default
		await expect(page.locator('[data-testid="variation-0"]')).toHaveClass(/btn-active/);

		// Switch to variation 2
		await page.locator('[data-testid="variation-1"]').click();
		await expect(page.locator('[data-testid="variation-1"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="variation-0"]')).not.toHaveClass(/btn-active/);

		// Switch to variation 3
		await page.locator('[data-testid="variation-2"]').click();
		await expect(page.locator('[data-testid="variation-2"]')).toHaveClass(/btn-active/);

		// Switch to INIT (index 8)
		await page.locator('[data-testid="variation-8"]').click();
		await expect(page.locator('[data-testid="variation-8"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="variation-2"]')).not.toHaveClass(/btn-active/);
	});

	test('switching slots after loading a performance', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('MorphingDrumDemo.prf2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// Slot A is active by default
		await expect(page.locator('[data-testid="slot-0"]')).toHaveClass(/btn-active/);
		const countsA = await getStatusCounts(page);
		expect(countsA.voiceModules + countsA.fxModules).toBeGreaterThan(0);

		// Switch to slot B
		await page.locator('[data-testid="slot-1"]').click();
		await expect(page.locator('[data-testid="slot-1"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="slot-0"]')).not.toHaveClass(/btn-active/);

		// On slot B: Voice is active by default
		await expect(page.getByRole('button', { name: 'Voice' })).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await expect(page.locator('[data-testid="canvas-fx"]')).not.toBeVisible();

		// Switch to FX area
		await page.getByRole('button', { name: 'FX' }).click();
		await expect(page.getByRole('button', { name: 'FX' })).toHaveClass(/btn-active/);
		await expect(page.getByRole('button', { name: 'Voice' })).not.toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="canvas-fx"]')).toBeVisible();
		await expect(page.locator('[data-testid="canvas-va"]')).not.toBeVisible();

		// Switch back to Voice
		await page.getByRole('button', { name: 'Voice' }).click();
		await expect(page.getByRole('button', { name: 'Voice' })).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		// Switch to slot C
		await page.locator('[data-testid="slot-2"]').click();
		await expect(page.locator('[data-testid="slot-2"]')).toHaveClass(/btn-active/);

		// Switch back to slot A
		await page.locator('[data-testid="slot-0"]').click();
		await expect(page.locator('[data-testid="slot-0"]')).toHaveClass(/btn-active/);
		await expect(page.locator('[data-testid="slot-2"]')).not.toHaveClass(/btn-active/);
	});
});
