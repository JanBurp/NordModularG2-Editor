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
		for (const [i, n] of ['Lead Saw', 'Strings3', 'Kick', 'Pad'].entries()) fs.copyFileSync(fixture, path.join(dir, `${encodeURIComponent(n)}__0${i}.pch2`));
		await sendMenuAction('toggle-bank-organizer');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
	});

	test('Escape in the delete dialog closes only the dialog, not the organizer', async ({ page }) => {
		await page.locator('[data-testid="storage-item"]').first().dragTo(page.locator('[data-testid="organizer-trash"]'));
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		await page.keyboard.press('Escape');

		await expect(dialog).toBeHidden();
		await expect(page.locator('[data-testid="bank-organizer"]')).toBeVisible();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
	});

	test('Delete… from the context menu, confirmed, deletes exactly that storage item', async ({ page }) => {
		await page.locator('[data-testid="storage-item"]', { hasText: 'Lead Saw' }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Delete…' }).click();
		await expect(page.getByRole('dialog')).toContainText('Lead Saw');
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(3);
		await expect(page.locator('[data-testid="storage-item"]', { hasText: 'Lead Saw' })).toHaveCount(0);
	});

	// Selection gestures, checked through what the delete dialog lists (then cancelled).
	const deleteDialogLists = async (page: import('@playwright/test').Page, names: string[]) => {
		await page.keyboard.press('Delete');
		const dialog = page.getByRole('dialog');
		for (const n of names) await expect(dialog).toContainText(n);
		await expect(dialog).toContainText(`Delete ${names.length} from Temporary Storage`);
		await page.getByRole('button', { name: 'Cancel' }).click();
	};

	test('Shift-click selects a range, Cmd/Ctrl-click toggles one', async ({ page }) => {
		const item = (n: string) => page.locator('[data-testid="storage-item"]', { hasText: n });
		await item('Strings3').click();
		await item('Pad').click({ modifiers: ['Shift'] });
		await deleteDialogLists(page, ['Strings3', 'Kick', 'Pad']);

		await item('Kick').click({ modifiers: ['ControlOrMeta'] });
		await deleteDialogLists(page, ['Strings3', 'Pad']);
	});

	test('Cmd/Ctrl-A selects all; Shift+arrows extend from the cursor', async ({ page }) => {
		await page.locator('[data-testid="storage-item"]', { hasText: 'Lead Saw' }).click();
		await page.keyboard.press('ControlOrMeta+a');
		await deleteDialogLists(page, ['Lead Saw', 'Strings3', 'Kick', 'Pad']);

		await page.locator('[data-testid="storage-item"]', { hasText: 'Strings3' }).click();
		await page.keyboard.press('Shift+ArrowRight');
		await page.keyboard.press('Shift+ArrowRight');
		await deleteDialogLists(page, ['Strings3', 'Kick', 'Pad']);
	});

	test('a multi-drop that does not fit shows a warning and changes nothing', async ({ page }) => {
		// Offline the banks are empty: from 1-127 only 127 and 128 are free, too few for 4.
		await page.locator('[data-testid="storage-item"]').first().click();
		await page.keyboard.press('ControlOrMeta+a');
		// Any selected item starts the drag of the whole selection (so the drag quirk noted above doesn't matter).
		await page.locator('[data-testid="storage-item"]').nth(1).dragTo(page.locator('[data-testid="bank-grid-left"] [data-testid="bank-cell-127"]'));
		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText('Not enough room');
		await expect(dialog).toContainText('4 patches don\'t fit');
		await page.getByRole('button', { name: 'OK' }).click();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
	});

	test('Undo (menu, as Cmd/Ctrl-Z) brings a deleted storage item back; Redo deletes it again', async ({ page, sendMenuAction }) => {
		await page.locator('[data-testid="storage-item"]', { hasText: 'Kick' }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Delete…' }).click();
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(3);

		await sendMenuAction('undo');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
		await expect(page.locator('[data-testid="storage-item"]', { hasText: 'Kick' })).toHaveCount(1);

		await sendMenuAction('redo');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(3);
	});
});
