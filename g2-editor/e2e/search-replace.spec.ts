import { dropModuleOnCanvas } from './helpers';
import { expect, test } from './fixtures/electron';

const OSC_A = 97;

test.describe('find & replace', () => {
	test('finds module names, Replace All renames them as one undo step', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, OSC_A, 0, 0);
		await dropModuleOnCanvas(page, OSC_A, 1, 0);
		const canvas = page.locator('[data-testid="canvas-va"]');
		const names = canvas.locator('[data-module-short="OscA"] > text');

		await sendMenuAction('toggle-search-replace');
		await page.getByTestId('search-term').fill('osca');
		await expect(page.getByTestId('search-count')).toHaveText(/Voice 2\/0\s+FX 0\/0\s+Morph 0/);
		await expect(canvas.locator('tspan.search-hit')).toHaveText(['OscA', 'OscA']); // only the found part

		// Module names only: unticking Modules leaves nothing to find
		await page.getByTitle('Search module names').click();
		await expect(page.getByTestId('search-count')).toHaveText(/^Voice 0\s+FX 0\s+Morph 0$/); // module counts hidden
		await page.getByTitle('Search module names').click();
		await expect(page.getByTestId('search-count')).toHaveText(/Voice 2\/0\s+FX 0\/0\s+Morph 0/);

		await page.getByTestId('search-replacement').fill('Vco');
		await page.getByTestId('search-replace-all').click();
		await expect(names.filter({ hasText: /^\s*Vco\d+\s*$/ })).toHaveCount(2);
		await expect(page.getByTestId('search-count')).toHaveText(/Voice 0\/0\s+FX 0\/0\s+Morph 0/);

		await sendMenuAction('undo');
		await expect(names.filter({ hasText: /^\s*OscA\d+\s*$/ })).toHaveCount(2);
	});
});
