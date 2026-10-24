import { dropModuleOnCanvas } from './helpers';
import { expect, test } from './fixtures/electron';

const MOD = { OscA: 97 } as const;

test.describe('Patch Mutator', () => {
	test('Randomize fills the six children; Mutate breeds new children from the Mother', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);

		await sendMenuAction('toggle-patch-mutator');
		const pane = page.locator('[data-mutator-pane]');
		await expect(pane).toBeVisible();
		// A filled MutaBox draws its chromosome as an svg; the children are the 6-column grid
		const children = pane.locator('.grid-cols-6 svg');
		const mutate = pane.getByRole('button', { name: 'Mutate', exact: true });
		const mother = pane.getByText('Mother', { exact: true }).locator('xpath=following-sibling::*[1]').locator('svg');
		const childPaths = () => pane.locator('.grid-cols-6 polyline').evaluateAll((els) => els.map((e) => e.getAttribute('points')));
		await expect(children).toHaveCount(0);
		await expect(mother).toHaveCount(0);
		await expect(mutate).toBeDisabled();

		await pane.getByRole('button', { name: 'Randomize', exact: true }).click();
		await expect(children).toHaveCount(6);

		// Child 1 is focused after Randomize; "O" copies the focused sound to Mother (pane key command)
		const randomized = await childPaths();
		await pane.press('o');
		await expect(mother).toHaveCount(1);
		await expect(mutate).toBeEnabled();

		// Mutate replaces the children with mutations of the Mother
		await mutate.click();
		await expect.poll(childPaths).not.toEqual(randomized);
		await expect(children).toHaveCount(6);
	});
});
