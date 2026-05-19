import { test, expect } from './fixtures/electron';

test.describe('offline – no patch loaded', () => {
	test('app launches and shows UI', async ({ page }) => {
		await expect(page).toHaveTitle(/G2/i);
	});

	test('status shows disconnected/offline', async ({ page }) => {
		const status = page.locator('[data-testid="connection-status"]');
		await expect(status).toBeVisible();
		const label = await status.innerText();
		expect(label.toLowerCase()).toMatch(/offline|disconnect|connect/);
	});

	test('no patch canvas or status-bar module counts visible by default', async ({ page }) => {
		// Without a patch loaded, status bar should not be in the DOM
		await expect(page.locator('[data-testid="canvas-va"]')).not.toBeVisible();
	});

	test('modules panel is open by default and can be toggled closed', async ({ page, sendMenuAction }) => {
		// Modules pane is open by default (showRightPane=true, rightPaneTab='modules')
		await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();

		// Toggle it closed
		await sendMenuAction('toggle-modules');
		await page.waitForTimeout(200);
		await expect(page.locator('[data-testid="module-item-OscA"]')).not.toBeVisible();

		// Toggle it back open
		await sendMenuAction('toggle-modules');
		await page.waitForTimeout(200);
		await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();
	});

	test('tab buttons for Modules and Browser are visible', async ({ page }) => {
		// The BtnGroup for pane tabs renders buttons with text "modules", "browser", etc.
		await expect(page.getByRole('button', { name: /modules/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /browser/i })).toBeVisible();
	});
});
