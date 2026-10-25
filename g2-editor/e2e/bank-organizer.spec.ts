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
		for (const [i, n] of ['Lead Saw', 'Strings3', 'Kick', 'Pad'].entries())
			fs.copyFileSync(fixture, path.join(dir, `${encodeURIComponent(n)}__0${i}.pch2`));
		await sendMenuAction('toggle-bank-organizer');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
	});

	test('hides the patch toolbars and has its own Undo/Redo; boxes show their full name on hover', async ({ page, sendMenuAction }) => {
		const organizer = page.locator('[data-testid="bank-organizer"]');
		await expect(page.getByRole('button', { name: 'Init 1' })).toBeHidden();
		await expect(organizer.locator('button[title^="Undo"]')).toBeVisible();
		await expect(page.locator('[data-testid="storage-item"]', { hasText: 'Lead Saw' })).toHaveAttribute('title', 'Lead Saw');

		await sendMenuAction('toggle-bank-organizer');
		await expect(page.getByRole('button', { name: 'Init 1' })).toBeVisible();
	});

	test('the link button makes both columns use the same sort', async ({ page }) => {
		const sortBtn = (side: string, name: string) => page.getByTestId(`bank-grid-${side}`).getByRole('button', { name, exact: true });
		await sortBtn('left', 'A–Z').click();
		await expect(sortBtn('right', 'Loc')).toHaveClass(/btn-active/);

		// Linking takes the sort of the side it is clicked on; then either side sets both.
		await page.getByTestId('sort-link-left').click();
		await expect(sortBtn('right', 'A–Z')).toHaveClass(/btn-active/);
		await sortBtn('right', 'Cat').click();
		await expect(sortBtn('left', 'Cat')).toHaveClass(/btn-active/);

		await page.getByTestId('sort-link-right').click();
		await sortBtn('right', 'Loc').click();
		await expect(sortBtn('left', 'Cat')).toHaveClass(/btn-active/);
	});

	test('Escape in the delete dialog closes only the dialog, not the organizer', async ({ page }) => {
		// Only a multi-delete asks for confirmation.
		await page.locator('[data-testid="storage-item"]').first().click();
		await page
			.locator('[data-testid="storage-item"]')
			.nth(1)
			.click({ modifiers: ['Shift'] });
		await page.locator('[data-testid="storage-item"]').first().dragTo(page.locator('[data-testid="organizer-trash"]'));
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		await page.keyboard.press('Escape');

		await expect(dialog).toBeHidden();
		await expect(page.locator('[data-testid="bank-organizer"]')).toBeVisible();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
	});

	test('Delete from the context menu deletes exactly that storage item, without asking', async ({ page }) => {
		await page.locator('[data-testid="storage-item"]', { hasText: 'Lead Saw' }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
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

	test('clicking a category in the top bar sets it on the selected items; Undo brings the old one back', async ({ page, sendMenuAction }) => {
		const item = (n: string) => page.locator('[data-testid="storage-item"]', { hasText: n });
		const category = page.locator('[data-testid="organizer-categories"] button', { hasText: 'User 1' });
		await expect(category).toBeDisabled(); // nothing selected yet

		await item('Strings3').click();
		await item('Kick').click({ modifiers: ['Shift'] });
		await category.click();
		await expect(item('Strings3')).toContainText('User 1');
		await expect(item('Kick')).toContainText('User 1');
		await expect(item('Pad')).toContainText('No Cat');

		await sendMenuAction('undo');
		await expect(item('Strings3')).toContainText('No Cat');
		await expect(item('Kick')).toContainText('No Cat');
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
		await expect(dialog).toContainText("4 patches don't fit");
		await page.getByRole('button', { name: 'OK' }).click();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
	});

	test('Undo (menu, as Cmd/Ctrl-Z) brings a deleted storage item back; Redo deletes it again', async ({ page, sendMenuAction }) => {
		await page.locator('[data-testid="storage-item"]', { hasText: 'Kick' }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(3);

		await sendMenuAction('undo');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(4);
		await expect(page.locator('[data-testid="storage-item"]', { hasText: 'Kick' })).toHaveCount(1);

		await sendMenuAction('redo');
		await expect(page.locator('[data-testid="storage-item"]')).toHaveCount(3);
	});

	test('Category from the context menu rewrites the storage file; Undo and Redo switch between both versions', async ({ page, sendMenuAction }) => {
		const kick = page.locator('[data-testid="storage-item"]', { hasText: 'Kick' });
		await kick.click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Category', exact: true }).hover();
		await page.getByRole('menuitem', { name: 'Bass', exact: true }).click();
		await expect(kick).toContainText('Bass');

		await sendMenuAction('undo');
		await expect(kick).toContainText('No Cat');
		await sendMenuAction('redo');
		await expect(kick).toContainText('Bass');
	});

	test('the category buttons show their hint, and are disabled for Performances', async ({ page }) => {
		const categories = page.locator('[data-testid="organizer-categories"]');
		await categories.hover();
		await expect(page.locator('.status-bar')).toContainText('give the selected patches this category');

		await page.locator('[data-testid="storage-item"]', { hasText: 'Kick' }).click();
		await expect(categories.getByRole('button', { name: 'Bass' })).toBeEnabled();
		await page.getByRole('button', { name: 'Performances' }).click();
		await expect(categories.getByRole('button', { name: 'Bass' })).toBeDisabled();
	});

	test('Delete deletes one selected item right away, asks for several', async ({ page }) => {
		const items = page.locator('[data-testid="storage-item"]');
		await items.filter({ hasText: 'Kick' }).click();
		await page.keyboard.press('Delete');
		await expect(items).toHaveCount(3);
		await expect(page.getByRole('dialog')).toHaveCount(0);

		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.press('Delete');
		await expect(page.getByRole('dialog')).toContainText('Delete 3 from Temporary Storage');
	});

	test('a slot box shows the category of its patch and changes it from its context menu', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await sendMenuAction('toggle-bank-organizer');
		await mockOpenPatch('Clavia demo.pch2');
		await sendMenuAction('open');
		await sendMenuAction('toggle-bank-organizer');
		const slotA = page.locator('[data-testid="organizer-slot-0"]');
		await expect(slotA).toContainText('A · No Cat');

		await slotA.click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Category', exact: true }).hover();
		await page.getByRole('menuitem', { name: 'Lead', exact: true }).click();
		await expect(slotA).toContainText('A · Lead');
	});
});
