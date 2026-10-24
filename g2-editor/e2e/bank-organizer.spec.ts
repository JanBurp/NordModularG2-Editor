import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures/electron';

// Bank Organizer, offline: Temporary Storage works without a G2 (files on this computer).
// Note: Playwright's HTML5 drag emulation here can start the drag on the neighbouring box (first
// storage box → its neighbour); a real mouse drag picks the right one (checked by hand 2026-10-24).
// So tests that care WHICH item is acted on use the context menu instead of dragging.
test.describe('Bank Organizer – offline', () => {
	test.beforeEach(async ({ app, page, sendMenuAction }) => {
		const userData = await app.evaluate(() => process.env.TEST_USER_DATA as string);
		const dir = path.join(userData, 'bank-storage');
		fs.mkdirSync(dir, { recursive: true });
		const fixture = path.resolve(__dirname, '../../test-patches/EmptyPatch.pch2');
		for (const [i, n] of ['Lead Saw', 'Strings3'].entries()) fs.copyFileSync(fixture, path.join(dir, `${encodeURIComponent(n)}__0${i}.pch2`));
		await sendMenuAction('toggle-bank-organizer');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(2);
	});

	test('Escape in the delete dialog closes only the dialog, not the organizer', async ({ page }) => {
		await page.locator('[data-testid="storage-item"]').first().dragTo(page.locator('[data-testid="organizer-trash"]'));
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		await page.keyboard.press('Escape');

		await expect(dialog).toBeHidden();
		await expect(page.locator('[data-testid="bank-organizer"]')).toBeVisible();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(2);
	});

	test('Delete… from the context menu, confirmed, deletes exactly that storage item', async ({ page }) => {
		await page.locator('[data-testid="storage-item"]', { hasText: 'Lead Saw' }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Delete…' }).click();
		await expect(page.getByRole('dialog')).toContainText('Lead Saw');
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(1);
		await expect(page.locator('[data-testid="storage-item"]')).toHaveText(/Strings3/);
	});
});
