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
		await expect(page.locator('[data-testid="module-item-OscA"]')).not.toBeVisible();

		// Toggle it back open
		await sendMenuAction('toggle-modules');
		await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();
	});

	test('tab buttons for Modules and Browser are visible', async ({ page }) => {
		// The BtnGroup for pane tabs renders buttons with text "modules", "browser", etc.
		await expect(page.getByRole('button', { name: /modules/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /browser/i })).toBeVisible();
	});

	test.describe('sidepane tab switching', () => {
		test('Browser tab hides module list and shows browser content', async ({ page }) => {
			await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();

			await page.getByRole('button', { name: 'Browser' }).click();

			await expect(page.locator('[data-testid="module-item-OscA"]')).not.toBeVisible();
			await expect(page.getByText(/Connect G2 to browse/i)).toBeVisible();
		});

		test('Modules tab returns to module list after switching to Browser', async ({ page }) => {
			await page.getByRole('button', { name: 'Browser' }).click();

			await page.getByRole('button', { name: 'Modules' }).click();

			await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();
		});
	});

	test.describe('module search / filter', () => {
		test('typing a module name shows only matching modules', async ({ page }) => {
			await page.getByPlaceholder('Search modules...').fill('OscA');

			await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();
			const countText = await page.locator('[data-testid="module-count"]').innerText();
			expect(parseInt(countText)).toBeLessThan(10);
		});

		test('unmatched search shows 0 modules', async ({ page }) => {
			await page.getByPlaceholder('Search modules...').fill('zzznomatch');

			await expect(page.locator('[data-testid="module-count"]')).toHaveText('0 modules');
			await expect(page.locator('[data-testid="module-item-OscA"]')).not.toBeVisible();
		});

		test('Escape clears search and restores all modules', async ({ page }) => {
			const search = page.getByPlaceholder('Search modules...');
			await search.fill('OscA');
			await search.press('Escape');

			await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();
			const countText = await page.locator('[data-testid="module-count"]').innerText();
			expect(parseInt(countText)).toBeGreaterThan(100);
		});

		test('category-level search filters by category name', async ({ page }) => {
			await page.getByPlaceholder('Search modules...').fill('osc');

			await expect(page.locator('[data-testid="module-item-OscA"]')).toBeVisible();
			const countText = await page.locator('[data-testid="module-count"]').innerText();
			const count = parseInt(countText);
			expect(count).toBeGreaterThan(0);
			expect(count).toBeLessThan(50);
		});
	});
});
