import { clickContextMenuItem, dropModuleOnCanvas, openContextMenu } from './helpers';
import fs from 'fs';
import { evaluateWithRetry, expect, test } from './fixtures/electron';

const MOD = { Out2: 4 } as const; // 2-Out: two level meters

test.describe('Meter Graph', () => {
	test('a canvas level meter is added to and removed from the graph via its context menu', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.Out2, 0, 0);

		const graph = page.getByTestId('meter-graph');
		const traces = page.getByTestId('meter-graph-trace');
		const meters = page.locator('[data-testid="canvas-va"] [data-module-short="2-Out"] [data-testid="vu-meter"]');

		// Adding the first meter opens the panel
		await openContextMenu(page, meters.nth(0));
		await clickContextMenuItem(page, 'Show in Meter Graph');
		await expect(graph).toBeVisible();
		await expect(traces).toHaveCount(1);
		await expect(traces.first()).toContainText('Meter 1');

		await openContextMenu(page, meters.nth(1));
		await clickContextMenuItem(page, 'Show in Meter Graph');
		await expect(traces).toHaveCount(2);

		await openContextMenu(page, meters.nth(0));
		await clickContextMenuItem(page, 'Remove from Meter Graph');
		await expect(traces).toHaveCount(1);
		await expect(traces.first()).toContainText('Meter 2');

		// Clicking a chip hides its line (chip dimmed), clicking again shows it
		await traces.first().click();
		await expect(traces.first()).toHaveClass(/opacity-40/);
		await traces.first().click();
		await expect(traces.first()).not.toHaveClass(/opacity-40/);

		// Menu toggle hides and shows it again, traces kept
		await sendMenuAction('toggle-meter-graph');
		await expect(graph).toHaveCount(0);
		await sendMenuAction('toggle-meter-graph');
		await expect(traces).toHaveCount(1);
	});

	test('the graphed meters are saved in the patch notes and restored on load', async ({ app, page, sendMenuAction, mockSaveDialog }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.Out2, 0, 0);
		await sendMenuAction('toggle-text-panel');
		const notes = page.getByPlaceholder('Patch notes…');
		await notes.fill('my notes');

		const meters = page.locator('[data-testid="canvas-va"] [data-module-short="2-Out"] [data-testid="vu-meter"]');
		for (const i of [0, 1]) {
			await openContextMenu(page, meters.nth(i));
			await clickContextMenuItem(page, 'Show in Meter Graph');
		}
		const traces = page.getByTestId('meter-graph-trace');
		await traces.nth(1).click(); // hide meter 2

		// The tag goes on top; the user's notes are kept below it
		await expect(notes).toHaveValue(/^\[metergraph: V\d+\.1 V\d+\.2-\]\nmy notes$/);

		const savedPath = await mockSaveDialog();
		await sendMenuAction('save-as');
		await expect.poll(() => fs.existsSync(savedPath) && fs.statSync(savedPath).size).toBeGreaterThan(0);

		// Another patch: no meters. Close the panel, then open the saved file.
		await sendMenuAction('new-patch');
		await expect(traces).toHaveCount(0);
		await page.getByTestId('meter-graph').getByRole('button', { name: '×', exact: true }).click();
		const data = Array.from(fs.readFileSync(savedPath));
		await evaluateWithRetry(
			app,
			({ ipcMain }, args) => {
				ipcMain.removeHandler('patch:open-dialog');
				ipcMain.handle('patch:open-dialog', async () => ({ success: true, filepath: args.savedPath, data: args.data }));
			},
			{ savedPath, data },
		);
		await sendMenuAction('open');
		await expect(notes).toHaveValue(/^\[metergraph: V\d+\.1 V\d+\.2-\]\nmy notes$/);

		// Restored, but the panel stays closed until shown
		await expect(page.getByTestId('meter-graph')).toHaveCount(0);
		await sendMenuAction('toggle-meter-graph');
		await expect(traces).toHaveCount(2);
		await expect(traces.nth(1)).toHaveClass(/opacity-40/);
	});
});
