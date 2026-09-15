import { clickContextMenuItem, createCable, dropModuleOnCanvas, getStatusCounts, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

// FltLP <-> FltClassic are both in nmg2mods.ts's "Filter" category with compatible jack
// signatures (see areModulesReplaceCompatible in src/renderer/nmg2mods.ts), so they replace
// each other. FltClassic additionally has an extra "PitchVar" input FltLP lacks.
const MOD = { OscA: 97, FltLP: 87, FltClassic: 92 } as const;

test.describe('replace module', () => {
	test('the corner triangle only appears when the module has replace candidates', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.FltLP, 0, 0);

		await expect(page.locator('[data-testid="canvas-va"] [data-module-short="FltLP"] [data-testid="module-replace-trigger"]')).toBeVisible();
	});

	test('replacing via the corner triangle swaps the module and preserves a compatible cable', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltLP, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltLP', jackType: 'input', connectorIdx: 0 });
		expect((await getStatusCounts(page)).voiceCables).toBe(1);

		const trigger = page.locator('[data-testid="canvas-va"] [data-module-short="FltLP"] [data-testid="module-replace-trigger"]');
		await trigger.click();
		await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
		await clickContextMenuItem(page, 'Filter Classic');

		const canvas = page.locator('[data-testid="canvas-va"]');
		await expect(canvas.locator('[data-module-short="FltClassic"]')).toBeVisible();
		await expect(canvas.locator('[data-module-short="FltLP"]')).not.toBeVisible();
		expect((await getStatusCounts(page)).voiceCables).toBe(1);
	});

	test('Replace Module appears in the right-click context menu with a submenu of candidates', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.FltLP, 0, 0);

		const mod = page.locator('[data-testid="canvas-va"] [data-module-short="FltLP"]');
		await openContextMenu(page, mod);
		const labels = (await page.locator('[data-testid="context-menu"] [role="menuitem"]').allTextContents()).map((t) => t.replace('▶', '').trim());
		expect(labels).toContain('Replace Module');
		await page.keyboard.press('Escape');
	});

	test('undo restores the original module and its cable', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltLP, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltLP', jackType: 'input', connectorIdx: 0 });

		const trigger = page.locator('[data-testid="canvas-va"] [data-module-short="FltLP"] [data-testid="module-replace-trigger"]');
		await trigger.click();
		await clickContextMenuItem(page, 'Filter Classic');
		await expect(page.locator('[data-testid="canvas-va"] [data-module-short="FltClassic"]')).toBeVisible();

		await sendMenuAction('undo');

		await expect(page.locator('[data-testid="canvas-va"] [data-module-short="FltLP"]')).toBeVisible();
		expect((await getStatusCounts(page)).voiceCables).toBe(1);
	});
});
