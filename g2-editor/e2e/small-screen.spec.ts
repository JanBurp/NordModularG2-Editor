import type { Locator, Page } from '@playwright/test';
import { evaluateWithRetry, expect, test } from './fixtures/electron';

// Official Raspberry Pi 7" display; also the window's minimum size (electron/main.ts)
const WIDTH = 800;
const HEIGHT = 480;
const CANVAS_MIN_WIDTH = 240;
const MIN_WIDE_PANE_WIDTH = 300;

// Per toolbar: does it stick out to the right, and do its wrapped rows all start at the same x?
// A flex item starts a new row when it lies left of the previous one.
async function toolbarProblems(page: Page): Promise<string[]> {
	return page.locator('[data-toolbar]').evaluateAll((bars) =>
		bars.flatMap((bar, i) => {
			const problems: string[] = [];
			if (bar.scrollWidth > bar.clientWidth + 1) problems.push(`toolbar ${i} overflows`);
			const items = [...bar.children].filter((c) => c.getBoundingClientRect().width > 0);
			const rowStarts = items.filter((c, j) => j === 0 || c.getBoundingClientRect().left < items[j - 1].getBoundingClientRect().left);
			const lefts = new Set(rowStarts.map((c) => Math.round(c.getBoundingClientRect().left)));
			if (lefts.size > 1) problems.push(`toolbar ${i} rows start at ${[...lefts].join(', ')}`);
			return problems;
		}),
	);
}

const panel = (page: Page) => page.getByTestId('side-panel');
const panelWidth = async (page: Page) => Math.round((await panel(page).boundingBox())!.width);

// Drags the side panel's left-edge splitbar (wide panes only) so the panel gets about `width` px
async function dragPanelTo(page: Page, width: number): Promise<void> {
	const box = (await page.getByTestId('side-panel-splitbar').boundingBox())!;
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width / 2, y);
	await page.mouse.down();
	await page.mouse.move(WIDTH - width, y, { steps: 5 });
	await page.mouse.up();
}

// Visible elements sticking out of the panel's right edge, or containers that scroll sideways
const clippedInPanel = (page: Page) =>
	panel(page).evaluate((p) => {
		const right = p.getBoundingClientRect().right;
		const scrollsSideways = (el: Element) => /auto|scroll/.test(window.getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1;
		return (
			[...p.querySelectorAll('*')]
				// HTML only: graphs nested in module previews report boxes wider than what their <svg> shows
				.filter((el) => el instanceof HTMLElement && el.checkVisibility() && (el.getBoundingClientRect().right > right + 1 || scrollsSideways(el)))
				.map((el) => `${el.tagName}.${el.getAttribute('class') ?? ''} ${el.textContent?.trim().slice(0, 20) ?? ''}`)
		);
	});

// Number of distinct rows (rounded tops) the elements are laid out on
const rowCount = (els: Locator) => els.evaluateAll((list) => new Set(list.map((el) => Math.round(el.getBoundingClientRect().top))).size);

test.describe('Small screen (800×480)', () => {
	test.beforeEach(async ({ app, page, sendMenuAction }) => {
		await evaluateWithRetry(
			app,
			({ BrowserWindow }, size) => {
				const win = BrowserWindow.getAllWindows()[0];
				win.unmaximize();
				win.setContentSize(size.w, size.h);
			},
			{ w: WIDTH, h: HEIGHT },
		);
		await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(WIDTH);
		await sendMenuAction('new-patch');
	});

	test('toolbars wrap instead of overflowing, rows flush left, in every toolbar mode', async ({ page, sendMenuAction }) => {
		for (let mode = 0; mode < 3; mode++) {
			await expect.poll(() => toolbarProblems(page)).toEqual([]);
			await sendMenuAction('toggle-extended-toolbar'); // cycles hidden → classic → compact
		}
	});

	test('ExtendedToolBar narrows in steps: Undo column and load meter make room, then every module icon still fits', async ({ app, page }) => {
		const bar = page.locator('[data-toolbar]').nth(1);
		const resize = (w: number) => evaluateWithRetry(app, ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 900), w);
		await resize(1300); // < 1356: no Undo column, load meter moved to the patch toolbar
		await expect(bar.getByRole('button', { name: 'New', exact: true })).toBeHidden();
		await expect(bar.getByTestId('load-meter')).toBeHidden();
		await expect(page.locator('[data-toolbar]').nth(2).getByTestId('load-meter')).toBeVisible();
		await bar.getByRole('button', { name: 'Osc', exact: true }).click(); // the category with the most modules
		await resize(950); // picker shrunk to about its minimum, still one row
		await expect.poll(() => toolbarProblems(page)).toEqual([]);
		const fits = await bar.locator('img[draggable]').evaluateAll((icons) => {
			const strip = icons[0].parentElement!.getBoundingClientRect();
			return icons.length > 10 && icons.every((i) => i.getBoundingClientRect().right <= strip.right + 0.5);
		});
		expect(fits).toBe(true);
		const rowTops = await bar.evaluate(
			(b) => new Set([...b.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round(c.getBoundingClientRect().top))).size,
		);
		expect(rowTops).toBe(1);
	});

	test('short window gets the slim ExtendedToolBar (category dropdown, no morph source buttons)', async ({ page }) => {
		await expect(page.getByTitle('Module category')).toBeVisible();
		await expect(page.locator('[data-morph-group] .btn-xs')).toHaveCount(0);
		// device bar + slim extended toolbar (wrapped) + patch toolbar: was ~280px before the slim layout
		const toolbarsBottom = await page.locator('[data-toolbar]').evaluateAll((bars) => Math.max(...bars.map((b) => b.getBoundingClientRect().bottom)));
		expect(toolbarsBottom).toBeLessThan(210);
	});

	test('wide pane resize keeps the canvas at least 240px and the panel at least 300px', async ({ page, sendMenuAction }) => {
		await sendMenuAction('toggle-patch-mutator');
		await dragPanelTo(page, WIDTH); // as wide as the window
		await expect.poll(() => panelWidth(page)).toBeLessThanOrEqual(WIDTH - CANVAS_MIN_WIDTH + 1);
		await dragPanelTo(page, 0);
		await expect.poll(() => panelWidth(page)).toBeGreaterThanOrEqual(MIN_WIDE_PANE_WIDTH - 1);
	});

	for (const action of ['toggle-browser', 'toggle-modules', 'toggle-library', 'toggle-midi-cc-panel', 'toggle-text-panel']) {
		test(`${action}: fixed-width pane, not resizable, nothing clipped`, async ({ page, sendMenuAction }) => {
			await sendMenuAction(action);
			await expect(panel(page)).toBeVisible();
			await expect(page.getByTestId('side-panel-splitbar')).toHaveCount(0);
			expect(await clippedInPanel(page)).toEqual([]);
		});
	}

	for (const action of ['toggle-patch-mutator', 'toggle-parameter-overview', 'toggle-settings']) {
		test(`${action}: wide pane reflows down to its minimum width without sideways scrolling`, async ({ page, sendMenuAction }) => {
			await sendMenuAction(action);
			await dragPanelTo(page, 0); // clamped to MIN_WIDE_PANE_WIDTH
			await expect.poll(() => panelWidth(page)).toBeLessThan(MIN_WIDE_PANE_WIDTH + 5);
			expect(await clippedInPanel(page)).toEqual([]);
		});
	}

	test('narrow Overview keeps 8 cells per row', async ({ page, sendMenuAction }) => {
		await sendMenuAction('toggle-parameter-overview');
		await dragPanelTo(page, 0);
		// page A, bank 1 = the first 8 cells
		const firstBankTops = await panel(page)
			.locator('[data-cell-slot]')
			.evaluateAll((cells) => new Set(cells.slice(0, 8).map((c) => Math.round(c.getBoundingClientRect().top))).size);
		expect(firstBankTops).toBe(1);
	});

	test('narrow Mutator keeps the settings block and the 7 Quick Locks on one row each', async ({ page, sendMenuAction }) => {
		await sendMenuAction('toggle-patch-mutator');
		await dragPanelTo(page, 0);
		// labels / displays+buttons / knobs+captions: 3 grid rows, as wide
		const settingsRows = await page.getByTestId('mutator-settings').evaluate((el) => window.getComputedStyle(el).gridTemplateRows.split(' ').length);
		expect(settingsRows).toBe(3);
		const locks = page.locator('[data-mutator-pane]').getByRole('button', { name: /^(OscFreq|OscFine|Envelope|SeqValue|SeqEvent|Delays|Effects)$/ });
		await expect(locks).toHaveCount(7);
		expect(await rowCount(locks)).toBe(1);
	});
});
