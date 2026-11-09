import { test, expect } from './fixtures/electron';

test.describe('module help (original Clavia pages)', () => {
	test('shows module help and follows a "Common … parameters" link with Back', async ({ page, sendMenuAction }) => {
		await sendMenuAction('toggle-modules');
		await page.getByTestId('modules-search').locator('input').fill('LfoA');
		await page.getByTestId('module-item-LfoA').click();

		const help = page.locator('.module-help');
		await expect(help.locator('.pHeading2')).toHaveText('LfoA');
		await expect(help.locator('.pFet_ord').first()).toHaveText('Waveforms');
		// The module-panel picture of the original page is dropped (the pane draws the module)
		await expect(help.locator('img')).toHaveCount(0);

		await help.getByText('Common LFO parameters').click();
		await expect(help.locator('.pHeading2')).toHaveText('Common LFO parameters');

		await help.locator('.help-back').click();
		await expect(help.locator('.pHeading2')).toHaveText('LfoA');
		await expect(help.locator('.help-back')).toHaveCount(0);
	});
});
