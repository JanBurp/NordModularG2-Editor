import { expect, test } from './fixtures/electron';

test.describe('load meter – DSP resource breakdown', () => {
	test('click opens a VA/FX table with cycles and every memory type, click again closes it', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		const meter = page.locator('[data-testid="load-meter"]:visible').first();
		await meter.click();

		const details = page.locator('[data-testid="load-details"]');
		await expect(details).toBeVisible();
		await expect(details.locator('th')).toHaveText(['%', 'VA', 'FX']);
		await expect(details.locator('tbody td:first-child')).toHaveText(['Cycles', 'Prog mem', 'X mem', 'Y mem', 'Zero page', 'Dyn mem', 'Q mem', 'R mem']);
		// Offline the G2 never reports 0x72, so every value stays 0
		for (const cell of await details.locator('tbody td:not(:first-child)').all()) await expect(cell).toHaveText('0.0');

		await meter.click({ position: { x: 4, y: 4 } });
		await expect(details).not.toBeVisible();
	});
});
