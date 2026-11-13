import { clickContextMenuItem, dropModuleOnCanvas, hoverContextMenuItem, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';
import type { MorphColor } from '../src/utils/morphColors';

const MOD = { OscA: 97 } as const;

test.describe('morph assign', () => {
	test('assigning a param to the selected Morph Group tints its knob and the menu then offers deassign', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);

		// OscA param 0 is the FreqCoarse knob (nmg2mods.ts); MorphKnobOverlay tints an assigned knob
		const knob = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-param-index="0"]');
		const tint = (color: MorphColor) => knob.locator(`[data-testid="morph-tint"][data-morph-color="${color}"]`);
		await expect(tint('red')).toHaveCount(0);

		// Group 1 is selected by default
		await openContextMenu(page, knob);
		await clickContextMenuItem(page, 'Morph assign (Group 1)');
		await expect(tint('red')).toHaveCount(1);

		await openContextMenu(page, knob);
		await expect(page.getByRole('menuitem', { name: 'Morph assign ✓ (Group 1)', exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);

		// Selecting another group in the Extended Toolbar: the knob shows it belongs to a different group (blue)
		await page.locator('[data-morph-group="1"]').getByTestId('morph-group-knob').click();
		await expect(tint('blue')).toHaveCount(1);
		await expect(tint('red')).toHaveCount(0);

		// Back on group 1, toggling the menu item again deassigns it
		await page.locator('[data-morph-group="0"]').getByTestId('morph-group-knob').click();
		// Clicking the toolbar knob can scroll the canvas out of view in a narrow window
		await knob.scrollIntoViewIfNeeded();
		await openContextMenu(page, knob);
		await clickContextMenuItem(page, 'Morph assign ✓ (Group 1)');
		await expect(tint('red')).toHaveCount(0);
		await expect(tint('blue')).toHaveCount(0);
	});

	test('the morph limit bar counts morphed params and opens the Morph pane, which lists, filters and deassigns', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		const module = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"]');
		const knob = module.locator('[data-param-index="0"]');
		const bar = page.getByTestId('morph-limit');
		await expect(bar).toContainText('0/25');

		await openContextMenu(page, knob);
		await clickContextMenuItem(page, 'Morph assign (Group 1)');
		await expect(bar).toContainText('1/25');

		await bar.click();
		const pane = page.getByTestId('morph-pane');
		await expect(pane).toBeVisible();
		await expect(pane.getByTestId('morph-pane-title')).toHaveText('Variation 1 · 1/25 params');
		const rows = pane.getByTestId('morph-row');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText('VA');

		// Filter on another group hides it, All shows it again
		await pane.getByTestId('morph-filter-1').click();
		await expect(rows).toHaveCount(0);
		await pane.getByTestId('morph-filter-all').click();
		await expect(rows).toHaveCount(1);

		// A row click selects its module on the canvas
		await page.keyboard.press('Escape');
		await rows.first().click();
		await expect(module).toHaveClass(/\bselected\b/);

		// × deassigns
		await rows.first().getByTestId('morph-row-remove').click();
		await expect(rows).toHaveCount(0);
		await expect(knob.locator('[data-testid="morph-tint"]')).toHaveCount(0);
		await expect(bar).toContainText('0/25');

		// Tools > Morph Panel toggles it
		await sendMenuAction('toggle-morph-panel');
		await expect(pane).toBeHidden();
		await sendMenuAction('toggle-morph-panel');
		await expect(pane).toBeVisible();
	});

	test('the morph group menu opens the Morph pane and copies a group to another variation', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		const knob = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-param-index="0"]');
		await openContextMenu(page, knob);
		await clickContextMenuItem(page, 'Morph assign (Group 1)');
		const bar = page.getByTestId('morph-limit');
		await expect(bar).toContainText('1/25');

		const group = page.locator('[data-morph-group="0"]');
		await openContextMenu(page, group);
		await clickContextMenuItem(page, 'Open Morph Panel');
		const pane = page.getByTestId('morph-pane');
		await expect(pane).toBeVisible();
		await openContextMenu(page, group);
		await clickContextMenuItem(page, 'Close Morph Panel');
		await expect(pane).toBeHidden();
		await openContextMenu(page, group);
		await clickContextMenuItem(page, 'Open Morph Panel');
		await pane.getByTestId('morph-pane-close').click();
		await expect(pane).toBeHidden();

		await openContextMenu(page, group);
		await hoverContextMenuItem(page, 'Copy to Variations');
		await clickContextMenuItem(page, '3');

		await sendMenuAction('variation-3');
		await expect(bar).toContainText('1/25');
		await sendMenuAction('variation-2');
		await expect(bar).toContainText('0/25');
	});
});
