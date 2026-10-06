import { sleep } from '../cli';
import { type ActionDef, clickItem, int, menuLabels, openMenu, orSkip, pick } from './ctx';

export const VARIATION_ACTIONS: ActionDef[] = [
	{
		name: 'switchVariation',
		weight: 2,
		burst: true,
		run: async (c, fast) => {
			const i = int(c, 8);
			await c.page.locator(`[data-testid="variation-${i}"]`).click();
			await sleep(fast ? 50 : 1000);
			return `variation ${i + 1}`;
		},
	},
	{
		// Variation button menu: "Copy to N", "Copy to INIT" or "Set to Init" (all edit-buffer only).
		name: 'copyVariation',
		weight: 1,
		run: async (c) =>
			orSkip('variation menu', async () => {
				const from = int(c, 8);
				await openMenu(c.page, c.page.locator(`[data-testid="variation-${from}"]`));
				const label = pick(c, await menuLabels(c.page));
				await clickItem(c.page, label);
				await sleep(500);
				return `variation ${from + 1}: ${label}`;
			}),
	},
];
