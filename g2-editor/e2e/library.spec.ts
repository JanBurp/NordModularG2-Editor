import type { Page } from '@playwright/test';
import { clickContextMenuItem, createCable, dropModuleOnCanvas, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

const MOD = { OscA: 97, FltClassic: 92 } as const;

const modules = (page: Page) => page.locator('[data-testid="canvas-va"] [data-module-short]');
const cables = (page: Page) => page.locator('[data-testid="canvas-va"] .svgcableborder');
const blockRow = (page: Page, name: string) => page.locator(`[data-testid="library-block-${name}"]`);

// Two cabled modules, saved as a block named `name`; the Library pane opens on save.
async function saveBlock(page: Page, sendMenuAction: (a: string) => Promise<void>, name: string): Promise<void> {
	await sendMenuAction('select-all');
	await sendMenuAction('save-block');
	const input = page.locator('[data-testid="save-block-name"]');
	await input.fill(name);
	await input.press('Enter');
	await expect(blockRow(page, name)).toBeVisible();
}

test.describe('Library (building blocks)', () => {
	test.beforeEach(async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 0, 6);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output' }, { moduleShort: 'FltClassic', jackType: 'input' });
		await expect(modules(page)).toHaveCount(2);
		await expect(cables(page)).toHaveCount(1);
	});

	test('saves the selection as a block and adds it back with its cable, as one undo step', async ({ page, sendMenuAction }) => {
		await saveBlock(page, sendMenuAction, 'Osc Filter');
		await expect(blockRow(page, 'Osc Filter')).toContainText('2 modules');

		await openContextMenu(page, blockRow(page, 'Osc Filter'));
		await clickContextMenuItem(page, 'Add to Patch');
		await expect(modules(page)).toHaveCount(4);
		await expect(cables(page)).toHaveCount(2);

		await sendMenuAction('undo');
		await expect(modules(page)).toHaveCount(2);
		await expect(cables(page)).toHaveCount(1);
	});

	test('never overwrites a block with the same name', async ({ page, sendMenuAction }) => {
		await saveBlock(page, sendMenuAction, 'Twin');
		await saveBlock(page, sendMenuAction, 'Twin');
		await expect(blockRow(page, 'Twin 2')).toBeVisible();
	});

	test('dropping a block on the canvas puts its top-left module at the drop cell', async ({ page, sendMenuAction }) => {
		await saveBlock(page, sendMenuAction, 'Dropped');
		const canvas = (await page.locator('[data-testid="canvas-va"]').boundingBox())!;
		await page.evaluate(
			({ x, y }) => {
				const dt = new DataTransfer();
				const row = document.querySelector('[data-testid="library-block-Dropped"]')!;
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
});
