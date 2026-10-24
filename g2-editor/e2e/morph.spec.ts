import { clickContextMenuItem, dropModuleOnCanvas, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';
import { MORPH_COLOR_HEX } from '../src/utils/morphColors';

const MOD = { OscA: 97 } as const;

test.describe('morph assign', () => {
	test('assigning a param to the selected Morph Group tints its knob and the menu then offers deassign', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);

		// OscA param 0 is the FreqCoarse knob (nmg2mods.ts); MorphKnobOverlay tints an assigned knob
		const knob = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-param-index="0"]');
		const tint = (color: keyof typeof MORPH_COLOR_HEX) => knob.locator(`circle[fill="${MORPH_COLOR_HEX[color]}"]`);
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
		await page.locator('[data-morph-group="1"] svg').first().click();
		await expect(tint('blue')).toHaveCount(1);
		await expect(tint('red')).toHaveCount(0);

		// Back on group 1, toggling the menu item again deassigns it
		await page.locator('[data-morph-group="0"] svg').first().click();
		// Clicking the toolbar knob can scroll the canvas out of view in a narrow window
		await knob.scrollIntoViewIfNeeded();
		await openContextMenu(page, knob);
		await clickContextMenuItem(page, 'Morph assign ✓ (Group 1)');
		await expect(tint('red')).toHaveCount(0);
		await expect(tint('blue')).toHaveCount(0);
	});
});
