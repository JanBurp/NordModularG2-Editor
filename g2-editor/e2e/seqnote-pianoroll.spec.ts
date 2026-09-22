import { test, expect } from './fixtures/electron';
import { openContextMenu, clickContextMenuItem } from './helpers';

// Mixturtrautonium.pch2 ships two real SeqNote (voice-area) instances, both at their
// hardware-widget default Magnifier/Octave view (zoom=1 [raw byte, i.e. 2 visible octaves],
// octaveOffset=5) — see src/parser/__tests__/patchRoundtrip.test.ts's "SeqNote pianoRollView
// round-trip" for the parser-level equivalent of this fixture fact.
test.describe('SeqNote piano-roll', () => {
	test('renders 16 step strips and the default zoom band selected', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		await expect(seqNote.locator('[data-testid="seqnote-step"]')).toHaveCount(16);
		await expect(seqNote.locator('[data-testid="seqnote-view-controls"]')).toBeVisible();
		await expect(seqNote.locator('[data-testid="seqnote-zoom-band"][data-zoom="1"]')).toHaveAttribute('data-selected', 'true');
	});

	test('clicking within a step strip sets its note value, and undo reverts it', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		const step = seqNote.locator('[data-testid="seqnote-step"][data-param-index="0"]');
		await step.scrollIntoViewIfNeeded();
		const before = await step.getAttribute('data-value');

		// zoom=1 (raw) -> 2 visible octaves -> 24 semitones, octaveOffset=5 -> lowest=60, highest=83.
		// Row index 13 from the top is note 70; away enough from the default center (64) that the
		// click is guaranteed to actually change something.
		const strip = step.locator('[data-testid="seqnote-step-strip"]');
		const rect = await strip.evaluate((el) => {
			const r = (el as SVGGraphicsElement).getBoundingClientRect();
			return { top: r.top, left: r.left, width: r.width, height: r.height };
		});
		const rowIndexFromTop = 13;
		const visibleSemitoneCount = 24;
		const targetX = rect.left + rect.width / 2;
		const targetY = rect.top + ((rowIndexFromTop + 0.5) / visibleSemitoneCount) * rect.height;

		await page.mouse.move(targetX, targetY);
		await page.mouse.down();
		await page.mouse.up();
		await page.waitForTimeout(100);

		expect(await step.getAttribute('data-value')).toBe('70');
		expect(await step.getAttribute('data-value')).not.toBe(before);

		await sendMenuAction('undo');
		await page.waitForTimeout(100);
		expect(await step.getAttribute('data-value')).toBe(before);
	});

	test('the Magnifier bands are directly selectable and update the visible window', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		const highlights = seqNote.locator('[data-testid="seqnote-step-value-highlight"]');
		const band = (zoom: 0 | 1 | 2) => seqNote.locator(`[data-testid="seqnote-zoom-band"][data-zoom="${zoom}"]`);

		await expect(band(1)).toHaveAttribute('data-selected', 'true');
		const countAtDefault = await highlights.count();

		await band(0).click();
		await expect(band(0)).toHaveAttribute('data-selected', 'true');
		await expect(band(1)).toHaveAttribute('data-selected', 'false');
		// Narrowing from 2 to 1 visible octave changes which steps' values are still in range.
		expect(await highlights.count()).not.toBe(countAtDefault);

		await band(2).click();
		await expect(band(2)).toHaveAttribute('data-selected', 'true');
	});

	test('the Octave stepper moves the visible window and clamps at the boundary', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		const octaveDownBtn = seqNote.locator('[data-testid="seqnote-octave-down"]');
		const highlights = seqNote.locator('[data-testid="seqnote-step-value-highlight"]');

		const before = await highlights.count();
		// octaveOffset starts at 5 (default); five clicks reaches the 0 boundary, moving the visible
		// window to the lowest possible octaves and changing which steps' values fall in range.
		for (let i = 0; i < 5; i++) await octaveDownBtn.click();
		const atBoundary = await highlights.count();
		expect(atBoundary).not.toBe(before);

		// One more click past the boundary should be a no-op (clamped).
		await octaveDownBtn.click();
		expect(await highlights.count()).toBe(atBoundary);
	});

	test('a step is morph-assignable via right-click, same as any other parameter', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		const step = seqNote.locator('[data-testid="seqnote-step"][data-param-index="0"]');
		const highlight = step.locator('[data-testid="seqnote-step-value-highlight"]');
		await step.scrollIntoViewIfNeeded();

		await openContextMenu(page, step);
		await clickContextMenuItem(page, 'Morph assign (Group 1)');

		// morphColorFor returns 'red' for the currently-selected group — same color ModuleSlider uses.
		await expect(highlight).toHaveAttribute('fill', '#e0303c');

		await openContextMenu(page, step);
		await clickContextMenuItem(page, 'Morph assign ✓ (Group 1)');
		await expect(highlight).toHaveAttribute('fill', '#f80');
	});
});
