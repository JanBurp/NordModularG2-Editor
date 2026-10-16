import { test, expect } from './fixtures/electron';
import { openContextMenu, clickContextMenuItem } from './helpers';

// One DrumSynth instance per factory preset, labeled with its name (see
// src/renderer/drumSynthPresets.ts for how this data was extracted).
const PRESET_NAMES = [
	'Kick 1',
	'Kick 2',
	'Kick 3',
	'Kick 4',
	'Kick 5',
	'Snare 1',
	'Snare 2',
	'Snare 3',
	'Snare 4',
	'Snare 5',
	'Tom1 1',
	'Tom1 2',
	'Tom1 3',
	'Tom2 1',
	'Tom2 2',
	'Tom2 3',
	'Tom3 1',
	'Tom3 2',
	'Tom3 3',
	'Cymb 1',
	'Cymb 2',
	'Cymb 3',
	'Cymb 4',
	'Cymb 5',
	'Perc 1',
	'Perc 2',
	'Perc 3',
	'Perc 4',
	'Perc 5',
	'Perc 6',
];

test.describe('DrumSynth preset selector', () => {
	test('shows the matching preset name for each of the 30 factory presets', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const modules = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]');
		await expect(modules).toHaveCount(30);

		const names = await modules.locator('[data-testid="drumsynth-preset-name"]').allTextContents();
		expect(names.map((n) => n.trim())).toEqual(PRESET_NAMES);
	});

	test('clicking next/prev steps through presets, updating params and the name together', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');

		const kick1 = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]').first();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 1');

		await kick1.locator('[data-testid="drumsynth-preset-next"]').click();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 2');

		await kick1.locator('[data-testid="drumsynth-preset-prev"]').click();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 1');
	});

	test('prev is a no-op on the first preset, next is a no-op on the last', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');

		const modules = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]');

		const kick1 = modules.first();
		await kick1.locator('[data-testid="drumsynth-preset-prev"]').click();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 1');

		const perc6 = modules.last();
		await expect(perc6.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Perc 6');
		await perc6.locator('[data-testid="drumsynth-preset-next"]').click();
		await expect(perc6.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Perc 6');
	});

	test('a single undo fully reverts a preset switch', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');

		const kick1 = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]').first();
		await kick1.locator('[data-testid="drumsynth-preset-next"]').click();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 2');

		await sendMenuAction('undo');
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 1');
	});

	test('next/prev keep working after a knob drifts the preset to "none"', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');

		const kick1 = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]').first();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 1');

		// Detune param index 4 (MasterLevel) via the "Set Value" dialog, same as a user manually
		// turning that knob — the preset should drift to "none".
		await openContextMenu(page, kick1.locator('[data-param-index="4"]'));
		await clickContextMenuItem(page, 'Set Value');
		const dialog = page.locator('[data-testid="param-edit-dialog"]');
		const input = dialog.locator('input');
		await expect(dialog.getByRole('button', { name: 'Set' })).toBeDisabled(); // nothing typed yet
		await input.fill('#1');
		await expect(dialog.getByRole('button', { name: 'Set' })).toBeEnabled();
		await input.press('Enter');
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('none');

		// The stepper must still work from here — regression guard for the bug where "none" left
		// next/prev permanently stuck (nothing to step from).
		await kick1.locator('[data-testid="drumsynth-preset-next"]').click();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 2');
	});

	test('clicking the name opens a dropdown listing all 30 presets for fast selection', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');

		const kick1 = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]').first();
		await kick1.locator('[data-testid="drumsynth-preset-open"]').click();

		const dropdown = page.locator('[data-testid="drumsynth-preset-dropdown"]');
		await expect(dropdown).toBeVisible();
		const optionNames = await dropdown.locator('div[data-testid^="drumsynth-preset-option-"]').allTextContents();
		expect(optionNames.map((n) => n.trim())).toEqual(PRESET_NAMES);

		await dropdown.locator('[data-testid="drumsynth-preset-option-24"]').click(); // "Perc 1"
		await expect(dropdown).not.toBeVisible();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Perc 1');
	});

	test('the dropdown closes without changing anything when dismissed via Escape', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('DrumSynthPresets.pch2');
		await sendMenuAction('open');

		const kick1 = page.locator('[data-testid="canvas-va"] [data-module-short="DrumSynth"]').first();
		await kick1.locator('[data-testid="drumsynth-preset-open"]').click();
		await expect(page.locator('[data-testid="drumsynth-preset-dropdown"]')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.locator('[data-testid="drumsynth-preset-dropdown"]')).not.toBeVisible();
		await expect(kick1.locator('[data-testid="drumsynth-preset-name"]')).toHaveText('Kick 1');
	});
});
