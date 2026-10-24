import type { Page } from '@playwright/test';
import { createCable, dropModuleOnCanvas } from './helpers';
import { evaluateWithRetry, expect, test } from './fixtures/electron';

const MOD = { OscA: 97, Out2: 4 } as const;

/** Opens the Settings pane; the 'toggle-settings' menu action expands its "Editor Options" section. */
async function openEditorOptions(page: Page, sendMenuAction: (a: string) => Promise<void>) {
	await sendMenuAction('toggle-settings');
	await expect(settingsRow(page, 'Theme')).toBeVisible();
}

const settingsRow = (page: Page, label: string) => page.locator('.settings-row').filter({ has: page.getByText(label, { exact: true }) });

/** The persisted settings store (pinia-plugin-persistedstate, localStorage key "settings"). */
const persisted = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('settings') ?? '{}'));

test.describe('settings pane', () => {
	test('Theme sets the native theme source and is persisted', async ({ app, page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await openEditorOptions(page, sendMenuAction);
		const row = settingsRow(page, 'Theme');
		// The theme only acts through nativeTheme (style.css uses prefers-color-scheme), and Playwright
		// pins the renderer's emulated colour scheme, so check the main-process side.
		const themeSource = () => evaluateWithRetry(app, ({ nativeTheme }) => nativeTheme.themeSource);

		await row.getByRole('button', { name: 'Dark', exact: true }).click();
		await expect.poll(themeSource).toBe('dark');
		await row.getByRole('button', { name: 'Light', exact: true }).click();
		await expect.poll(themeSource).toBe('light');
		await expect.poll(async () => (await persisted(page)).theme).toBe('light');
	});

	test('Dim unused modules dims only modules without a cable and is persisted', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.OscA, 0, 4);
		await dropModuleOnCanvas(page, MOD.Out2, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: '2-Out', jackType: 'input', connectorIdx: 0 });

		const canvas = page.locator('[data-testid="canvas-va"]');
		const unused = canvas.locator('[data-module-short].unused');
		await expect(unused).toHaveCount(0);

		await openEditorOptions(page, sendMenuAction);
		const checkbox = settingsRow(page, 'Dim unused modules').getByRole('checkbox');
		await checkbox.click();
		await expect(checkbox).toHaveAttribute('aria-checked', 'true');
		await expect(unused).toHaveCount(1);
		await expect(canvas.locator('[data-module-short="OscA"]').nth(1)).toHaveClass(/\bunused\b/);
		await expect.poll(async () => (await persisted(page)).dimUnusedModules).toBe(true);

		await checkbox.click();
		await expect(unused).toHaveCount(0);
	});

	test('Cable Style switches the cable rendering class on the canvas', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.Out2, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: '2-Out', jackType: 'input', connectorIdx: 0 });

		const canvas = page.locator('[data-testid="canvas-va"]');
		await expect(canvas.locator('svg.cables-flat')).toHaveCount(0);

		await openEditorOptions(page, sendMenuAction);
		await settingsRow(page, 'Style').getByRole('button', { name: 'Flat', exact: true }).click();
		await expect(canvas.locator('svg.cables-flat')).toHaveCount(1);
		await expect.poll(async () => (await persisted(page)).cableStyle).toBe('flat');
	});
});
