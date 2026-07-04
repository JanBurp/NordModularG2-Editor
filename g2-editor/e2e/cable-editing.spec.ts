import { clickContextMenuItem, createCable, dropModuleOnCanvas, getStatusCounts, grabAndDropCableEnd, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

// Module IDs from nmg2mods
const MOD = { OscA: 97, FltClassic: 92, Mix21A: 194 } as const;

const CABLE_COLOR_NAMES = ['red', 'blue', 'yellow', 'orange', 'green', 'purple', 'white'];

async function soleCableAttrs(
	page: import('@playwright/test').Page,
): Promise<{ smod: string; scon: string; dmod: string; dcon: string; dir: string; colour: string; key: string; d: string } | null> {
	return page.evaluate(() => {
		const el = document.querySelector('.svgcableborder[data-cable-key]');
		if (!el) return null;
		return {
			smod: el.getAttribute('data-smod')!,
			scon: el.getAttribute('data-scon')!,
			dmod: el.getAttribute('data-dmod')!,
			dcon: el.getAttribute('data-dcon')!,
			dir: el.getAttribute('data-dir')!,
			colour: el.getAttribute('data-cable-color')!,
			key: el.getAttribute('data-cable-key')!,
			d: el.getAttribute('d')!,
		};
	});
}

async function moduleIdx(page: import('@playwright/test').Page, moduleShort: string): Promise<string> {
	const idx = await page.locator(`[data-testid="canvas-va"] [data-module-short="${moduleShort}"]`).getAttribute('data-module-idx');
	if (idx === null) throw new Error(`Module not found: ${moduleShort}`);
	return idx;
}

test.describe('cable editing – break / hover / ctrl-drag', () => {
	test('Break menu item appears between Delete connected and Set Cable Color', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });

		const jack = page.locator('[data-testid="canvas-va"] [data-module-short="FltClassic"] [data-jack="input-0"]');
		await openContextMenu(page, jack);
		const labels = (await page.locator('[data-testid="context-menu"] [role="menuitem"]').allTextContents()).map((t) => t.replace('▶', '').trim());
		expect(labels).toEqual(['Delete connected', 'Break', 'Set Cable Color']);
		await page.keyboard.press('Escape');
	});

	test('Break on a jack with one cable behaves like Delete connected', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });
		expect((await getStatusCounts(page)).voiceCables).toBe(1);

		const jack = page.locator('[data-testid="canvas-va"] [data-module-short="FltClassic"] [data-jack="input-0"]');
		await openContextMenu(page, jack);
		await clickContextMenuItem(page, 'Break');

		expect((await getStatusCounts(page)).voiceCables).toBe(0);
	});

	test('Break on an output fanning to 3 inputs chains the orphaned inputs together', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 4);
		await dropModuleOnCanvas(page, MOD.Mix21A, 2, 0);

		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0, occurrence: 0 });
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0, occurrence: 1 });
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'Mix2-1A', jackType: 'input', connectorIdx: 0 });
		expect((await getStatusCounts(page)).voiceCables).toBe(3);

		const oscOut = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-jack="output-0"]');
		await openContextMenu(page, oscOut);
		await clickContextMenuItem(page, 'Break');

		expect((await getStatusCounts(page)).voiceCables).toBe(2);
		// OscA's output-0 should no longer feed anything.
		const oscIdx = await moduleIdx(page, 'OscA');
		const stillDriven = await page.evaluate(
			(oscIdx) => !!document.querySelector(`.svgcableborder[data-smod="${oscIdx}"][data-scon="0"][data-dir="1"]`),
			oscIdx,
		);
		expect(stillDriven).toBe(false);
	});

	test('hovering a jack temporarily reveals its color-hidden cable', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });

		const attrs = await soleCableAttrs(page);
		if (!attrs) throw new Error('Cable not found');
		const colorName = CABLE_COLOR_NAMES[parseInt(attrs.colour)];

		await page.locator(`[data-testid="cable-toggle-${colorName}"]`).click();
		await expect(page.locator(`.svgcableborder[data-cable-key="${attrs.key}"]`)).toHaveClass(/cable-hidden/);

		const jack = page.locator('[data-testid="canvas-va"] [data-module-short="FltClassic"] [data-jack="input-0"]');
		await jack.hover();
		await expect(page.locator(`.svgcableborder[data-cable-key="${attrs.key}"]`)).not.toHaveClass(/cable-hidden/);

		await page.mouse.move(5, 5);
		await expect(page.locator(`.svgcableborder[data-cable-key="${attrs.key}"]`)).toHaveClass(/cable-hidden/);
	});

	test('Ctrl/Cmd-drag relocates a cable to a different compatible jack', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await dropModuleOnCanvas(page, MOD.Mix21A, 2, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });
		expect((await getStatusCounts(page)).voiceCables).toBe(1);

		await grabAndDropCableEnd(
			page,
			0,
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
			{ moduleShort: 'Mix2-1A', jackType: 'input', connectorIdx: 0 },
		);

		expect((await getStatusCounts(page)).voiceCables).toBe(1);
		const mixIdx = await moduleIdx(page, 'Mix2-1A');
		const attrs = await soleCableAttrs(page);
		expect(attrs?.dmod).toBe(mixIdx);
		expect(attrs?.dcon).toBe('0');
	});

	test('Ctrl/Cmd-drag deletes a cable when dropped in empty canvas space', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });
		expect((await getStatusCounts(page)).voiceCables).toBe(1);

		await grabAndDropCableEnd(page, 0, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 }, { empty: true });

		expect((await getStatusCounts(page)).voiceCables).toBe(0);
	});

	test('Ctrl/Cmd-drag back onto the original jack is a no-op', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });
		const before = await soleCableAttrs(page);

		await grabAndDropCableEnd(
			page,
			0,
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
		);

		expect((await getStatusCounts(page)).voiceCables).toBe(1);
		const after = await soleCableAttrs(page);
		expect(after?.key).toBe(before?.key);
		expect(after?.d).toBe(before?.d); // visually reverted to its pre-drag curve, not left bent toward the mouse
	});

	test('Ctrl/Cmd-drag released directly on an incompatible jack reverts instead of deleting', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
		await createCable(page, { moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 }, { moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 });
		const before = await soleCableAttrs(page);

		// Grab the input end and release directly on an output jack — a mismatched type, so the
		// drop is invalid. Landing on empty canvas would delete the cable; landing on a specific
		// but incompatible jack should revert it instead.
		await grabAndDropCableEnd(
			page,
			0,
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
			{ moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 },
		);

		expect((await getStatusCounts(page)).voiceCables).toBe(1);
		const after = await soleCableAttrs(page);
		expect(after?.key).toBe(before?.key);
		expect(after?.d).toBe(before?.d);
	});
});
