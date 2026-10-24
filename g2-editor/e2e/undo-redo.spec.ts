import { dropModuleOnCanvas, getStatusCounts } from './helpers';
import { expect, test } from './fixtures/electron';

const MOD = { OscA: 97, FltClassic: 92, EnvADSR: 20 } as const;

test.describe('undo / redo history', () => {
	test('multi-step undo and redo, and a new edit after undo discards the redo stack', async ({ page, sendMenuAction }) => {
		const undoBtn = page.getByTitle('Undo (⌘Z)');
		const redoBtn = page.getByTitle('Redo (⇧⌘Z)');

		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await dropModuleOnCanvas(page, MOD.EnvADSR, 2, 0);
		expect((await getStatusCounts(page)).voiceModules).toBe(3);
		await expect(redoBtn).toBeDisabled();

		for (const expected of [2, 1, 0]) {
			await sendMenuAction('undo');
			await expect.poll(async () => (await getStatusCounts(page)).voiceModules).toBe(expected);
		}
		await expect(redoBtn).toBeEnabled();

		await sendMenuAction('redo');
		await sendMenuAction('redo');
		await expect.poll(async () => (await getStatusCounts(page)).voiceModules).toBe(2);
		const canvas = page.locator('[data-testid="canvas-va"]');
		await expect(canvas.locator('[data-module-short="OscA"]')).toBeVisible();
		await expect(canvas.locator('[data-module-short="FltClassic"]')).toBeVisible();
		await expect(canvas.locator('[data-module-short="EnvADSR"]')).toHaveCount(0);
		await expect(redoBtn).toBeEnabled();

		// A new edit while a redo step is pending drops that step.
		await dropModuleOnCanvas(page, MOD.OscA, 2, 4);
		expect((await getStatusCounts(page)).voiceModules).toBe(3);
		await expect(redoBtn).toBeDisabled();
		await sendMenuAction('redo');
		await page.waitForTimeout(100);
		expect((await getStatusCounts(page)).voiceModules).toBe(3);

		// The toolbar buttons drive the same history.
		await undoBtn.click();
		await expect.poll(async () => (await getStatusCounts(page)).voiceModules).toBe(2);
		await redoBtn.click();
		await expect.poll(async () => (await getStatusCounts(page)).voiceModules).toBe(3);
	});
});
