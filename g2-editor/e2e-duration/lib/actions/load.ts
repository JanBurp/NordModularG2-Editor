import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, ensureShown, focusedSlot, int, orSkip, UI_TIMEOUT_MS, waitIdle } from './ctx';

/**
 * Loads a synth patch or performance the way a user does: patch browser tab, then a double click
 * (two clicks within 400 ms; the browser does its own double-click detection).
 * Only list rows are clicked, never their context menus (Store / Delete / Clear bank live there).
 */
async function loadFromBrowser(c: ActionCtx, tab: 'Patches' | 'Performances'): Promise<string> {
	const tabBtn = c.page.locator(`button.btn:text-is("${tab}")`);
	if (!(await ensureShown(c, tabBtn, 'toggle-browser'))) return 'skipped: patch browser not shown';
	await tabBtn.first().click({ timeout: UI_TIMEOUT_MS });
	await sleep(500);
	// Collapsed banks hide their rows: expand all once.
	const expand = c.page.locator('[title="Expand All"]:visible');
	if ((await expand.count()) > 0) await expand.first().click({ timeout: UI_TIMEOUT_MS });
	const rows = c.page.locator('li:visible:not(.sticky):has(div.w-8)');
	const n = await rows.count();
	if (n === 0) return `skipped: no ${tab.toLowerCase()} listed`;
	const row = rows.nth(int(c, n));
	const label = (await row.innerText({ timeout: UI_TIMEOUT_MS })).replace(/\s+/g, ' ').trim();
	await row.scrollIntoViewIfNeeded({ timeout: UI_TIMEOUT_MS });
	await row.click({ timeout: UI_TIMEOUT_MS });
	await row.click({ timeout: UI_TIMEOUT_MS });
	await waitIdle(c.page, 30_000);
	return label;
}

export const LOAD_ACTIONS: ActionDef[] = [
	{
		name: 'loadPatch',
		weight: 2,
		run: async (c) =>
			orSkip('patch browser', async () => {
				const slot = await focusedSlot(c.page);
				const label = await loadFromBrowser(c, 'Patches');
				if (label.startsWith('skipped')) return label;
				c.own.delete(slot);
				await sleep(4000); // editor reloads the slot from the hardware echo
				return `${slot} <- ${label}`;
			}),
	},
	{
		// Only in Performance mode: in Patch mode a performance load flips the G2's mode (togglePerfMode covers that).
		name: 'loadPerformance',
		weight: 1,
		enabled: (c) => c.mode === 'Performance',
		run: async (c) =>
			orSkip('patch browser', async () => {
				const label = await loadFromBrowser(c, 'Performances');
				if (label.startsWith('skipped')) return label;
				c.own.clear();
				await sleep(8000);
				// The G2 substitutes "Perf. Corrupt" when the stored performance won't load (seen 2026-10-05, bank 2/25).
				const loaded = (await c.page.locator('span.text.w-36.cursor-pointer').first().innerText({ timeout: UI_TIMEOUT_MS })).trim();
				if (loaded === 'Perf. Corrupt') throw new Error(`G2 loaded "Perf. Corrupt" for ${label}: stored performance is damaged`);
				return `performance ${label}`;
			}),
	},
];
