import type { Page } from '@playwright/test';
import { clickContextMenuItem, dropModuleOnCanvas, openContextMenu } from './helpers';
import { evaluateWithRetry, expect, test } from './fixtures/electron';

const MOD = { OscA: 97, FltClassic: 92 } as const;

const moduleAt = (page: Page, short: string, occurrence: number) => page.locator(`[data-testid="canvas-va"] [data-module-short="${short}"]`).nth(occurrence);
const knobOf = (page: Page, short: string, occurrence: number, paramIndex = 0) =>
	moduleAt(page, short, occurrence).locator(`[data-param-index="${paramIndex}"] .knob-control`);

// Click a module's title bar; with `add` the module joins the current selection (Shift-click).
async function selectModule(page: Page, short: string, occurrence: number, add = false): Promise<void> {
	const box = await moduleAt(page, short, occurrence).locator('[data-drag-handle]').boundingBox();
	if (!box) throw new Error(`Module drag handle not found: ${short}[${occurrence}]`);
	if (add) await page.keyboard.down('Shift');
	await page.mouse.click(box.x + 64, box.y + 8);
	if (add) await page.keyboard.up('Shift');
	await page.waitForTimeout(100);
}

async function setKnobRaw(page: Page, short: string, occurrence: number, raw: number): Promise<void> {
	await openContextMenu(page, knobOf(page, short, occurrence));
	await clickContextMenuItem(page, 'Set Value');
	const input = page.locator('[data-testid="param-edit-dialog"] input');
	await input.fill(`#${raw}`);
	await input.press('Enter');
	await expect(knobOf(page, short, occurrence)).toHaveAttribute('data-value', String(raw));
}

test.describe('Paste Params', () => {
	test.beforeEach(async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.OscA, 1, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 0, 6);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 6);
	});

	test('pastes values and morphs onto another module of the same type, as one undo step', async ({ page, sendMenuAction }) => {
		const target = knobOf(page, 'OscA', 1);
		const before = await target.getAttribute('data-value');
		await setKnobRaw(page, 'OscA', 0, 10);
		// Group 1 is selected by default; an assigned knob gets a red tint (see morph.spec.ts)
		await openContextMenu(page, knobOf(page, 'OscA', 0));
		await clickContextMenuItem(page, 'Morph assign (Group 1)');
		const targetTint = target.locator('[data-testid="morph-tint"][data-morph-color="red"]');
		await expect(targetTint).toHaveCount(0);

		await selectModule(page, 'OscA', 0);
		await sendMenuAction('copy');
		await selectModule(page, 'OscA', 1);
		await sendMenuAction('paste-params');
		await expect(target).toHaveAttribute('data-value', '10');
		await expect(targetTint).toHaveCount(1);

		await sendMenuAction('undo');
		await expect(target).toHaveAttribute('data-value', before!);
		await expect(targetTint).toHaveCount(0);
		await expect(knobOf(page, 'OscA', 0)).toHaveAttribute('data-value', '10'); // the source is untouched
	});

	test('pairs copied and selected modules by type, not by selection order', async ({ page, sendMenuAction }) => {
		await setKnobRaw(page, 'OscA', 0, 10);
		await setKnobRaw(page, 'FltClassic', 0, 20);

		await selectModule(page, 'OscA', 0);
		await selectModule(page, 'FltClassic', 0, true);
		await sendMenuAction('copy');
		await selectModule(page, 'FltClassic', 1);
		await selectModule(page, 'OscA', 1, true);
		await sendMenuAction('paste-params');

		await expect(knobOf(page, 'OscA', 1)).toHaveAttribute('data-value', '10');
		await expect(knobOf(page, 'FltClassic', 1)).toHaveAttribute('data-value', '20');
	});

	test('does nothing and warns when the selection does not match the copied modules', async ({ page, sendMenuAction }) => {
		const before = await knobOf(page, 'FltClassic', 1).getAttribute('data-value');
		await setKnobRaw(page, 'OscA', 0, 10);
		await selectModule(page, 'OscA', 0);
		await sendMenuAction('copy');

		await selectModule(page, 'FltClassic', 1);
		await sendMenuAction('paste-params');
		await expect(page.getByText('Selection does not match the original data.')).toBeVisible();
		await expect(knobOf(page, 'FltClassic', 1)).toHaveAttribute('data-value', before!);
	});

	test('the module context menu and the Edit menu only enable Paste Params for a matching target', async ({ app, page, sendMenuAction }) => {
		await selectModule(page, 'OscA', 0);
		await sendMenuAction('copy');

		const pasteItem = page.getByRole('menuitem', { name: 'Paste Params', exact: true });
		await openContextMenu(page, moduleAt(page, 'OscA', 1).locator('[data-drag-handle]'));
		await expect(pasteItem).not.toHaveClass(/cursor-not-allowed/);
		await page.keyboard.press('Escape');
		await openContextMenu(page, moduleAt(page, 'FltClassic', 0).locator('[data-drag-handle]'));
		await expect(pasteItem).toHaveClass(/cursor-not-allowed/);
		await page.keyboard.press('Escape');

		// The native Edit menu: only macOS has an application menu to inspect (elsewhere it is per window)
		test.skip(process.platform !== 'darwin', 'native application menu is macOS-only');
		const editMenuEnabled = () =>
			evaluateWithRetry(app, ({ Menu }) => {
				const edit = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Edit');
				return edit?.submenu?.items.find((i) => i.label === 'Paste Params')?.enabled ?? null;
			});
		await selectModule(page, 'OscA', 1);
		await expect.poll(editMenuEnabled).toBe(true);
		await selectModule(page, 'FltClassic', 0);
		await expect.poll(editMenuEnabled).toBe(false);
		await selectModule(page, 'OscA', 1, true); // two selected, one copied
		await expect.poll(editMenuEnabled).toBe(false);
	});
});
