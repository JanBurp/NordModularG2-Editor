import { clickContextMenuItem, createCable, deleteModule, dropModuleOnCanvas, getStatusCounts, openContextMenu } from './helpers';
import { expect, test } from './fixtures/electron';

// Module IDs from nmg2mods
const MOD = { OscA: 97, FltClassic: 92, EnvADSR: 20, Mix21A: 194, Out2: 4 } as const;

async function addAllSynthModules(page: import('@playwright/test').Page) {
	await dropModuleOnCanvas(page, MOD.OscA, 0, 0); // OscA #1
	await dropModuleOnCanvas(page, MOD.OscA, 0, 3); // OscA #2
	await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);
	await dropModuleOnCanvas(page, MOD.EnvADSR, 1, 4);
	await dropModuleOnCanvas(page, MOD.Mix21A, 2, 0);
	await dropModuleOnCanvas(page, MOD.Out2, 2, 4);
}

test.describe('patch editing – offline', () => {
	test('create new patch shows empty canvas', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const counts = await getStatusCounts(page);
		expect(counts.voiceModules).toBe(0);
		expect(counts.voiceCables).toBe(0);
	});

	test('drag OscA onto canvas adds one module', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		const counts = await getStatusCounts(page);
		expect(counts.voiceModules).toBe(1);
		await expect(page.locator('[data-testid="canvas-va"] [data-module-short="OscA"]')).toBeVisible();
	});

	test('add all 6 synth modules', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		await addAllSynthModules(page);

		const counts = await getStatusCounts(page);
		expect(counts.voiceModules).toBe(6);
		const canvas = page.locator('[data-testid="canvas-va"]');
		expect(await canvas.locator('[data-module-short="OscA"]').count()).toBe(2);
		await expect(canvas.locator('[data-module-short="FltClassic"]')).toBeVisible();
		await expect(canvas.locator('[data-module-short="EnvADSR"]')).toBeVisible();
		await expect(canvas.locator('[data-module-short="Mix2-1A"]')).toBeVisible();
		await expect(canvas.locator('[data-module-short="2-Out"]')).toBeVisible();

		// TODO: Fix ContextMenu testing
		// Rename the Mix2-1A module via context menu
		// const mixEl = canvas.locator('[data-module-short="Mix2-1A"]');
		// await openContextMenu(page, mixEl);
		// await clickContextMenuItem(page, 'Rename…');
		// await page.locator('input[maxlength="16"]').fill('MyMixer');
		// await page.keyboard.press('Enter');
		// await page.waitForTimeout(200);
		// await expect(mixEl).toBeVisible();

		// Change module color
		// await openContextMenu(page, mixEl);
		// await hoverContextMenuItem(page, 'Set Color');
		// await page.locator('button.w-10').first().click();
		// await page.waitForTimeout(200);

		// Rename first switch label on Mix2-1A
		// const switchEl = mixEl.locator('.switch-control').first();
		// await openContextMenu(page, switchEl);
		// await clickContextMenuItem(page, 'Rename label');
		// await page.locator('input[maxlength="16"]').fill('Chan1');
		// await page.keyboard.press('Enter');
		// await page.waitForTimeout(200);
	});

	test('connect OscA output to FltClassic input', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await addAllSynthModules(page);

		const before = await getStatusCounts(page);
		await createCable(
			page,
			{ moduleShort: 'OscA', jackType: 'output', connectorIdx: 0, occurrence: 0 },
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
		);
		const after = await getStatusCounts(page);
		expect(after.voiceCables).toBe(before.voiceCables + 1);
	});

	test('wire up a simple signal chain: 2×OscA → Mix2-1A → FltClassic → 2-Out, EnvADSR → FltClassic', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await addAllSynthModules(page);

		await createCable(
			page,
			{ moduleShort: 'OscA', jackType: 'output', connectorIdx: 0, occurrence: 0 },
			{ moduleShort: 'Mix2-1A', jackType: 'input', connectorIdx: 0 },
		);
		await createCable(
			page,
			{ moduleShort: 'OscA', jackType: 'output', connectorIdx: 0, occurrence: 1 },
			{ moduleShort: 'Mix2-1A', jackType: 'input', connectorIdx: 1 },
		);
		await createCable(
			page,
			{ moduleShort: 'Mix2-1A', jackType: 'output', connectorIdx: 0 },
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
		);
		await createCable(
			page,
			{ moduleShort: 'EnvADSR', jackType: 'output', connectorIdx: 0 },
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 1 },
		);
		await createCable(
			page,
			{ moduleShort: 'FltClassic', jackType: 'output', connectorIdx: 0 },
			{ moduleShort: '2-Out', jackType: 'input', connectorIdx: 0 },
		);

		const counts = await getStatusCounts(page);
		expect(counts.voiceCables).toBe(5);
	});

	test('move a module by dragging its title bar', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);

		const modEl = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"]').first();
		const box = await modEl.boundingBox();
		if (!box) throw new Error('Module not found');

		// Drag the title row (top 18px) to a new position
		const handleX = box.x + 64;
		const handleY = box.y + 8;

		await page.mouse.move(handleX, handleY);
		await page.mouse.down();
		await page.mouse.move(handleX + 256, handleY + 48, { steps: 10 });
		await page.mouse.up();

		// Module still visible after move
		await expect(modEl).toBeVisible();
		const counts = await getStatusCounts(page);
		expect(counts.voiceModules).toBe(1);
	});

	test('select and move a module by its body (a passive label below the title row)', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);

		const modEl = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"]').first();
		const box = (await modEl.boundingBox())!;
		const labels = modEl.locator('text[pointer-events="none"][font-size="9"]'); // ModuleVeText, not switch labels
		let label: { x: number; y: number } | null = null;
		for (let i = 0; i < (await labels.count()) && !label; i++) {
			const b = await labels.nth(i).boundingBox();
			if (b && b.y > box.y + 20) label = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
		}
		if (!label) throw new Error('No passive label below the title row');

		await page.mouse.click(label.x, label.y);
		await expect(modEl).toHaveClass(/selected/);

		await page.mouse.move(label.x, label.y);
		await page.mouse.down();
		await page.mouse.move(label.x + 256, label.y + 48, { steps: 10 });
		await page.mouse.up();
		await expect.poll(async () => (await modEl.boundingBox())!.x).toBeGreaterThan(box.x + 100);
	});

	test('Focus on hover: a knob dragged off and released elsewhere no longer takes the arrow keys', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await sendMenuAction('toggle-settings');
		const checkbox = page
			.getByTestId('settings-row')
			.filter({ has: page.getByText('Focus on hover', { exact: true }) })
			.getByRole('checkbox');
		await checkbox.click();
		await expect(checkbox).toHaveAttribute('aria-checked', 'true');

		const knob = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-param-index="0"] .knob-control');
		const box = (await knob.boundingBox())!;
		const value = async () => Number(await knob.getAttribute('data-value'));

		// Hovered, the knob takes the arrow keys
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		const v0 = await value();
		await page.keyboard.press('ArrowUp');
		await expect.poll(value).toBe(v0 + 1);

		// Dragged off the knob and released over empty canvas, it doesn't any more
		await page.mouse.down();
		await page.mouse.move(box.x + 300, box.y - 20, { steps: 10 });
		await page.mouse.up();
		const v1 = await value();
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(200);
		expect(await value()).toBe(v1);
	});

	test('delete a module with the Delete key', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);

		await deleteModule(page, 'OscA', 0, () => sendMenuAction('delete'));

		const counts = await getStatusCounts(page);
		expect(counts.voiceModules).toBe(1);
		await expect(page.locator('[data-testid="canvas-va"] [data-module-short="FltClassic"]')).toBeVisible();
	});

	test('delete a cable via context-menu on a connected jack', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await dropModuleOnCanvas(page, MOD.OscA, 0, 0);
		await dropModuleOnCanvas(page, MOD.FltClassic, 1, 0);

		await createCable(
			page,
			{ moduleShort: 'OscA', jackType: 'output', connectorIdx: 0 },
			{ moduleShort: 'FltClassic', jackType: 'input', connectorIdx: 0 },
		);

		expect((await getStatusCounts(page)).voiceCables).toBe(1);

		// Right-click the connected jack
		const jack = page.locator('[data-testid="canvas-va"] [data-module-short="OscA"] [data-jack="output-0"]');
		await openContextMenu(page, jack);
		await clickContextMenuItem(page, 'Delete connected');
		expect((await getStatusCounts(page)).voiceCables).toBe(0);
	});

	test('select-all then Delete removes all modules', async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();
		await addAllSynthModules(page);

		await sendMenuAction('select-all');
		await page.waitForTimeout(100);
		await sendMenuAction('delete');

		await expect(page.locator('[data-testid="canvas-va"] [data-module-short]')).toHaveCount(0);
		const counts = await getStatusCounts(page);
		expect(counts.voiceModules).toBe(0);
	});
});
