import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { clickContextMenuItem, createCable, dropModuleOnCanvas, hoverContextMenuItem, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

const MOD = { OscA: 97, FltClassic: 92 } as const;

const modules = (page: Page) => page.locator('[data-testid="canvas-va"] [data-module-short]');
const cables = (page: Page) => page.locator('[data-testid="canvas-va"] .svgcableborder');
const itemRow = (page: Page, name: string) => page.locator(`[data-testid="library-item-${name}"]`);

// Two cabled modules, saved to the library as `name`; the Library pane opens on save.
async function saveToLibrary(page: Page, sendMenuAction: (a: string) => Promise<void>, name: string): Promise<void> {
	await sendMenuAction('select-all');
	await sendMenuAction('save-to-library');
	const input = page.locator('[data-testid="save-library-name"]');
	await input.fill(name);
	await input.press('Enter');
	// The pane searches for the new item ("Name 2" when the name was taken); cleared again for the tests below.
	const search = page.locator('[data-testid="library-search"] input');
	await expect(search).toHaveValue(new RegExp(`^Saved ${name}( \\d+)?$`));
	await search.fill('');
}

test.describe('Library', () => {
	test.beforeEach(async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 0, 6);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output' }, { moduleShort: 'FltClassic', jackType: 'input' });
		await expect(modules(page)).toHaveCount(2);
		await expect(cables(page)).toHaveCount(1);
	});

	test('saves the selection to the library and adds it back with its cable, as one undo step', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Osc Filter');
		await expect(itemRow(page, 'Osc Filter')).toContainText('2 modules');

		await openContextMenu(page, itemRow(page, 'Osc Filter'));
		await clickContextMenuItem(page, 'Add to Patch');
		await expect(modules(page)).toHaveCount(4);
		await expect(cables(page)).toHaveCount(2);

		await sendMenuAction('undo');
		await expect(modules(page)).toHaveCount(2);
		await expect(cables(page)).toHaveCount(1);
	});

	test('never overwrites an item with the same name', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Twin');
		await saveToLibrary(page, sendMenuAction, 'Twin');
		await expect(itemRow(page, 'Twin 2')).toBeVisible();
	});

	test('clicking an item shows and hides its notes', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Noted');
		const notes = page.locator('[data-testid="library-notes"]');
		// On the preview: its modules' own controls must not swallow the click.
		await itemRow(page, 'Noted').locator('svg [data-module-short="OscA"]').click({ force: true });
		await expect(notes).toHaveText('No notes.');
		await itemRow(page, 'Noted').click();
		await expect(notes).toHaveCount(0);
	});

	test('search filters by name and shows the notes of a single match', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Alpha');
		await saveToLibrary(page, sendMenuAction, 'Beta');
		await expect(page.locator('[data-testid="library-count"]')).toHaveText('2 items');
		await page.locator('[data-testid="library-search"] input').fill('alp');
		await expect(page.locator('[data-testid="library-count"]')).toHaveText('1 items');
		await expect(itemRow(page, 'Beta')).toBeHidden();
		await expect(page.locator('[data-testid="library-notes"]')).toBeVisible();
	});

	test('subfolders of the library folder are groups', async ({ app, page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Kick');
		const userData = await app.evaluate(() => process.env.TEST_USER_DATA as string);
		fs.mkdirSync(path.join(userData, 'library', 'Drums'));
		fs.renameSync(path.join(userData, 'library', 'Kick.pch2'), path.join(userData, 'library', 'Drums', 'Kick.pch2'));
		await sendMenuAction('toggle-library');
		await sendMenuAction('toggle-library'); // re-reads the folder
		const pane = page.locator('[data-testid="library-pane"]');
		await expect(pane.getByText('Drums (1)')).toBeVisible();
		await expect(itemRow(page, 'Kick')).toBeVisible();
		await pane.getByText('Drums (1)').click();
		await expect(itemRow(page, 'Kick')).toHaveCount(0);
	});

	test('search "<group> <term>" picks folders first, then filters inside them', async ({ app, page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Kick');
		await saveToLibrary(page, sendMenuAction, 'Snare');
		const userData = await app.evaluate(() => process.env.TEST_USER_DATA as string);
		fs.mkdirSync(path.join(userData, 'library', 'Drums'));
		fs.renameSync(path.join(userData, 'library', 'Kick.pch2'), path.join(userData, 'library', 'Drums', 'Kick.pch2'));
		await sendMenuAction('toggle-library');
		await sendMenuAction('toggle-library'); // re-reads the folder
		const search = page.locator('[data-testid="library-search"] input');
		const count = page.locator('[data-testid="library-count"]');
		await search.fill('dru ');
		await expect(count).toHaveText('1 items');
		await expect(itemRow(page, 'Kick')).toBeVisible();
		await search.fill('sav sn');
		await expect(count).toHaveText('1 items');
		await expect(itemRow(page, 'Snare')).toBeVisible();
		await search.fill('dru sn');
		await expect(count).toHaveText('0 items');
	});

	test('a tall preview is cut at 8.5 module rows until the item is clicked', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Tall'); // OscA (4 rows) above FltClassic at row 6: 10 rows
		const preview = itemRow(page, 'Tall').locator('[data-testid="library-preview"]');
		expect((await preview.boundingBox())!.height).toBeCloseTo(8.5 * 16, 0);
		await itemRow(page, 'Tall').click();
		await expect.poll(async () => (await preview.boundingBox())!.height).toBeGreaterThan(8.5 * 16);
	});

	test('saves into a new group with notes, and offers that group next time', async ({ app, page, sendMenuAction }) => {
		await sendMenuAction('select-all');
		await sendMenuAction('save-to-library');
		await page.locator('[data-testid="save-library-group"]').fill('My Voices');
		await page.locator('[data-testid="save-library-name"]').fill('Lead');
		const notes = page.locator('[data-testid="save-library-notes"]');
		await notes.fill('Line one');
		await notes.press('Enter'); // a new line, not Save
		await notes.pressSequentially('Line two');
		await notes.press('ControlOrMeta+Enter');
		await expect(itemRow(page, 'Lead')).toBeVisible();

		const userData = await app.evaluate(() => process.env.TEST_USER_DATA as string);
		expect(fs.existsSync(path.join(userData, 'library', 'My Voices', 'Lead.pch2'))).toBe(true);
		await expect(page.locator('[data-testid="library-pane"]').getByText('My Voices (1)')).toBeVisible();
		await itemRow(page, 'Lead').click();
		await expect(page.locator('[data-testid="library-notes"]')).toHaveText('Line one\nLine two');

		await sendMenuAction('save-to-library');
		await expect(page.locator('[data-testid="save-library-group"]')).toHaveValue('My Voices'); // the last group used
		const group = page.locator('[data-testid="save-library-group"]');
		await group.fill('voi');
		await page.locator('[data-testid="combo-options"]').getByText('My Voices').click();
		await expect(group).toHaveValue('My Voices');
	});

	test('dragging canvas modules onto the Library pane opens the save dialog and keeps them in place', async ({ page, sendMenuAction }) => {
		await sendMenuAction('toggle-library');
		await sendMenuAction('select-all');
		const osc = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"]');
		const before = await osc.getAttribute('transform');
		const handle = (await osc.locator('[data-drag-handle]').boundingBox())!;
		const pane = (await page.locator('[data-testid="library-pane"]').boundingBox())!;
		await page.mouse.move(handle.x + 64, handle.y + 8);
		await page.mouse.down();
		await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2, { steps: 10 });
		await page.mouse.up();
		const name = page.locator('[data-testid="save-library-name"]');
		await name.fill('Dragged');
		await name.press('Enter');
		await expect(itemRow(page, 'Dragged')).toContainText('2 modules'); // the whole selection
		await expect(osc).toHaveAttribute('transform', before!);
	});

	test('after saving, the pane searches for the new item so only it is shown', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Other');
		await sendMenuAction('select-all');
		await sendMenuAction('save-to-library');
		await page.locator('[data-testid="save-library-group"]').fill('My Voices');
		const name = page.locator('[data-testid="save-library-name"]');
		await name.fill('Osc Filter');
		await name.press('Enter');
		await expect(page.locator('[data-testid="library-search"] input')).toHaveValue('My Osc Filter');
		await expect(page.locator('[data-testid="library-count"]')).toHaveText('1 items');
		await expect(itemRow(page, 'Osc Filter')).toBeVisible();
	});

	test('Edit… changes the notes, and renames/moves the item when name or group change', async ({ app, page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Draft');
		await openContextMenu(page, itemRow(page, 'Draft'));
		await clickContextMenuItem(page, 'Edit…');
		await expect(page.locator('[data-testid="save-library-name"]')).toHaveValue('Draft');
		await page.locator('[data-testid="save-library-group"]').fill('Finished');
		await page.locator('[data-testid="save-library-name"]').fill('Final');
		await page.locator('[data-testid="save-library-notes"]').fill('Edited notes');
		await page.locator('[data-testid="save-library-notes"]').press('ControlOrMeta+Enter');

		const lib = path.join(await app.evaluate(() => process.env.TEST_USER_DATA as string), 'library');
		await expect.poll(() => fs.existsSync(path.join(lib, 'Finished', 'Final.pch2'))).toBe(true);
		expect(fs.existsSync(path.join(lib, 'Draft.pch2'))).toBe(false); // moved, not copied
		await expect(itemRow(page, 'Draft')).toHaveCount(0);
		await itemRow(page, 'Final').click();
		await expect(page.locator('[data-testid="library-notes"]')).toHaveText('Edited notes');
		await expect(itemRow(page, 'Final')).toContainText('2 modules');

		// Notes only, from the notes box: stays where it is
		await page.locator('[data-testid="library-edit"]').click();
		await page.locator('[data-testid="save-library-notes"]').fill('Second edit');
		await page.locator('[data-testid="save-library-notes"]').press('ControlOrMeta+Enter');
		await itemRow(page, 'Final').click();
		await expect(page.locator('[data-testid="library-notes"]')).toHaveText('Second edit');
		expect(fs.readdirSync(path.join(lib, 'Finished'))).toEqual(['Final.pch2']);
	});

	test('dropping a library item on the canvas puts its top-left module at the drop cell', async ({ page, sendMenuAction }) => {
		await saveToLibrary(page, sendMenuAction, 'Dropped');
		const canvas = (await page.locator('[data-testid="canvas-va"]').boundingBox())!;
		await page.evaluate(
			({ x, y }) => {
				const dt = new DataTransfer();
				const row = document.querySelector('[data-testid="library-item-Dropped"]')!;
				row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
				const el = document.querySelector('[data-testid="canvas-va"]')!;
				el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
				el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
				row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
			},
			{ x: canvas.x + 2 * 256 + 128, y: canvas.y + 3 * 16 + 8 },
		);
		await expect(modules(page)).toHaveCount(4);
		await expect(cables(page)).toHaveCount(2);
		// The copies are selected after the insert; the OscA copy sits at column 2, row 3.
		const osc = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"]').nth(1);
		await expect(osc).toHaveAttribute('transform', 'translate(512, 48)');
	});

	test('saves author, tags (plus the group) and the assignments in the notes header', async ({ page, sendMenuAction }) => {
		// OscA param 0 is FreqCoarse (nmg2mods.ts)
		await openContextMenu(page, page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-param-index="0"]'));
		await hoverContextMenuItem(page, 'Assign CC…');
		await clickContextMenuItem(page, 'CC 2: Breath');

		await sendMenuAction('select-all');
		await sendMenuAction('save-to-library');
		await page.locator('[data-testid="save-library-group"]').fill('My Voices');
		await page.locator('[data-testid="save-library-name"]').fill('Tagged');
		await page.locator('[data-testid="save-library-author"]').fill('Jan');
		await page.locator('[data-testid="save-library-tags"]').fill('Lead, mono');
		await expect(page.locator('[data-testid="save-library-assignments"]')).toContainText(/midi:\[CC2 OscA\d*\.FreqCoarse\]/);
		await page.locator('[data-testid="save-library-name"]').press('Enter');

		await itemRow(page, 'Tagged').click();
		await expect(page.locator('[data-testid="library-tags"]')).toHaveText(/my voices\s*lead\s*mono/);
		await expect(page.locator('[data-testid="library-pane"]').getByText('Jan')).toBeVisible();

		// Inserted: the CC is offered, "in use" (the original OscA holds it), so unchecked
		await openContextMenu(page, itemRow(page, 'Tagged'));
		await clickContextMenuItem(page, 'Add to Patch');
		const dialog = page.locator('[data-testid="library-assignments"]');
		await expect(dialog).toContainText('in use');
		await expect(page.locator('[data-testid="library-assignment-0"]')).toHaveAttribute('aria-checked', 'false');
		await page.getByRole('button', { name: 'Insert', exact: true }).click();
		await expect(modules(page)).toHaveCount(4);

		await sendMenuAction('undo');
		await expect(modules(page)).toHaveCount(2);
	});
});
