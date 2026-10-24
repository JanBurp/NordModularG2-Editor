import { clickContextMenuItem, dropModuleOnCanvas, hoverContextMenuItem, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

const MOD = { OscA: 97 } as const;

test.describe('MIDI CC pane', () => {
	test('a CC assigned via the param context menu is listed, and Remove All clears it', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);

		// OscA param 0 is the FreqCoarse knob (nmg2mods.ts)
		const knob = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-param-index="0"]');
		await openContextMenu(page, knob);
		await hoverContextMenuItem(page, 'Assign CC…');
		await clickContextMenuItem(page, 'CC 2: Breath');

		await sendMenuAction('toggle-midi-cc-panel');
		const removeAll = page.getByRole('button', { name: 'Remove All', exact: true });
		await expect(removeAll).toBeEnabled();
		// CC rows are draggable; the assigned one shows the CC's short name and the param name
		const row = page.locator('[draggable="true"]').filter({ hasText: 'FreqCoarse' });
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('Breath');

		// The param's context menu now offers to deassign that CC
		await openContextMenu(page, knob);
		await expect(page.getByRole('menuitem', { name: 'Deassign CC (2)', exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);

		await removeAll.click();
		const dialog = page.getByRole('dialog', { name: 'Remove All CC Assignments' });
		// The count includes the CC assignments the built-in EmptyPatch.pch2 (new patch) already carries
		await expect(dialog).toContainText(/Remove all \d+ CC assignments\?/);
		await dialog.getByRole('button', { name: 'OK', exact: true }).click();

		await expect(row).toHaveCount(0);
		await expect(removeAll).toBeDisabled();
	});
});
