import { clickContextMenuItem, dropModuleOnCanvas, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

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
});
