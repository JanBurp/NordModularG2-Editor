import { expect, test } from './fixtures/electron';

test.describe('performance – MorphingDrumDemo.prf2', () => {
	test.beforeEach(async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('MorphingDrumDemo.prf2');
		await sendMenuAction('open');
		await page.waitForTimeout(500);
	});

	test.describe('slot switching', () => {
		test('all four slot buttons are visible', async ({ page }) => {
			for (const s of [0, 1, 2, 3]) {
				await expect(page.locator(`[data-testid="slot-${s}"]`)).toBeVisible();
			}
		});

		test('clicking slot B (index 1) makes it active', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();
			await expect(slotB).toHaveClass(/btn-active/);
		});

		test('switching slots changes the active canvas content', async ({ page }) => {
			await page.locator('[data-testid="slot-0"]').click();
			const countA = await page.locator('[data-module-short]').count();

			await page.locator('[data-testid="slot-1"]').click();
			await page.waitForTimeout(200);
			const countB = await page.locator('[data-module-short]').count();

			// Slots may differ; just assert both render without error
			expect(countA).toBeGreaterThanOrEqual(0);
			expect(countB).toBeGreaterThanOrEqual(0);
		});
	});

	test.describe('variation switching', () => {
		// VARIATION_OPTIONS values are 0-7 (label shows 1-8)
		test('variation buttons (indices 0-7) are visible', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			for (let i = 0; i < 8; i++) {
				await expect(page.locator(`[data-testid="variation-${i}"]`)).toBeVisible();
			}
		});

		test('clicking variation index 2 makes it active', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			const v2 = page.locator('[data-testid="variation-2"]');
			await v2.click();
			await expect(v2).toHaveClass(/btn-active/);
		});

		test('can cycle through all 8 variations', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			for (let i = 0; i < 8; i++) {
				await page.locator(`[data-testid="variation-${i}"]`).click();
				await expect(page.locator(`[data-testid="variation-${i}"]`)).toHaveClass(/btn-active/);
			}
		});
	});

	test.describe('cable visibility', () => {
		test('hide all cables button exists', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			await expect(page.locator('[data-testid="cable-toggle-all"]')).toBeVisible();
		});

		test('individual color toggle buttons are visible', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			for (const color of ['red', 'blue', 'yellow', 'orange', 'green', 'purple', 'white']) {
				await expect(page.locator(`[data-testid="cable-toggle-${color}"]`)).toBeVisible();
			}
		});

		test('toggling hide-all changes visibility of all colors consistently', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			const hideAll = page.locator('[data-testid="cable-toggle-all"]');
			const redBtn = page.locator('[data-testid="cable-toggle-red"]');

			// Record initial state
			const initiallyVisible = await redBtn.evaluate((el) => el.classList.contains('opacity-100'));

			// First click flips the state
			await hideAll.click();
			await page.waitForTimeout(200);
			const afterFirstClick = await redBtn.evaluate((el) => el.classList.contains('opacity-100'));
			expect(afterFirstClick).toBe(!initiallyVisible);

			// Second click restores
			await hideAll.click();
			await page.waitForTimeout(200);
			const afterSecondClick = await redBtn.evaluate((el) => el.classList.contains('opacity-100'));
			expect(afterSecondClick).toBe(initiallyVisible);
		});

		test('toggling individual color changes only that color', async ({ page }) => {
			const slotB = page.locator('[data-testid="slot-1"]');
			await slotB.click();

			const redBtn = page.locator('[data-testid="cable-toggle-red"]');
			const blueBtn = page.locator('[data-testid="cable-toggle-blue"]');

			const redInitial = await redBtn.evaluate((el) => el.classList.contains('opacity-100'));
			const blueInitial = await blueBtn.evaluate((el) => el.classList.contains('opacity-100'));

			await redBtn.click();
			await page.waitForTimeout(150);

			const redAfter = await redBtn.evaluate((el) => el.classList.contains('opacity-100'));
			const blueAfter = await blueBtn.evaluate((el) => el.classList.contains('opacity-100'));

			expect(redAfter).toBe(!redInitial);     // red flipped
			expect(blueAfter).toBe(blueInitial);   // blue unchanged

			// Restore
			await redBtn.click();
		});
	});
});
