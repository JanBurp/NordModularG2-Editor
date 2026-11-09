import type { Page } from '@playwright/test';
import { evaluateWithRetry, expect, test } from './fixtures/electron';

// Official Raspberry Pi 7" display; also the window's minimum size (electron/main.ts)
const WIDTH = 800;
const HEIGHT = 480;
const CANVAS_MIN_WIDTH = 240;

// Toolbars wrap instead of overflowing: nothing sticks out to the right
async function overflowingToolbars(page: Page): Promise<number> {
	return page.locator('[data-toolbar]').evaluateAll((bars) => bars.filter((b) => b.scrollWidth > b.clientWidth + 1).length);
}

// Drags the side panel's left-edge splitbar so the panel gets about `width` px
async function dragPanelTo(page: Page, width: number): Promise<void> {
	const bar = page.getByTestId('side-panel-splitbar');
	const box = (await bar.boundingBox())!;
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width / 2, y);
	await page.mouse.down();
	await page.mouse.move(WIDTH - width, y, { steps: 5 });
	await page.mouse.up();
}

const panel = (page: Page) => page.getByTestId('side-panel-splitbar').locator('..');
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

	test('toolbars wrap instead of overflowing, in every toolbar mode', async ({ page, sendMenuAction }) => {
		for (let mode = 0; mode < 3; mode++) {
			await expect.poll(() => overflowingToolbars(page)).toBe(0);
			if (process.env.SMALL_SCREEN_SHOTS) await page.screenshot({ path: `test-results/small-toolbar-${mode}.png` });
			await sendMenuAction('toggle-extended-toolbar'); // cycles hidden → classic → compact
		}
	});

	test('side panel resize keeps the canvas at least 240px and the panel at least its minimum', async ({ page, sendMenuAction }) => {
		await sendMenuAction('toggle-patch-mutator');
		await dragPanelTo(page, WIDTH); // as wide as the window
		await expect.poll(async () => (await panel(page).boundingBox())!.width).toBeLessThanOrEqual(WIDTH - CANVAS_MIN_WIDTH + 1);
		await dragPanelTo(page, 0);
		await expect.poll(async () => (await panel(page).boundingBox())!.width).toBeGreaterThanOrEqual(299); // Mutator minimum
	});

	const PANES = [
		'toggle-patch-mutator',
		'toggle-parameter-overview',
		'toggle-browser',
		'toggle-modules',
		'toggle-library',
		'toggle-midi-cc-panel',
		'toggle-text-panel',
		'toggle-settings',
	];
	for (const action of PANES) {
		test(`${action}: pane reflows down to the minimum panel width without sideways scrolling`, async ({ page, sendMenuAction }) => {
			await sendMenuAction(action);
			await dragPanelTo(page, 0); // clamped to the pane's minimum width
			await expect.poll(async () => Math.round((await panel(page).boundingBox())!.width)).toBeLessThan(305); // minimum: 272 or 300
			expect(await clippedInPanel(page)).toEqual([]);
			if (process.env.SMALL_SCREEN_SHOTS) {
				for (const w of [300, 240, 560]) {
					await dragPanelTo(page, w);
					const sc = page.locator(
						action === 'toggle-patch-mutator'
							? '[data-mutator-pane] >> xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]'
							: 'div.flex-1.overflow-y-auto.select-none.p-2',
					);
					for (let i = 0; i < 3; i++) {
						await sc.evaluate((el, i) => (el.scrollTop = i * 330), i);
						await page.screenshot({
							path: `test-results/small-${action}-${w}-${i}.png`,
							clip: { x: WIDTH - w - 10, y: 0, width: w + 10, height: HEIGHT },
						});
					}
				}
			}
		});
	}
});
