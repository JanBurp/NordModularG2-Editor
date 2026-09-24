import { test, expect } from './fixtures/electron';
import { openContextMenu, clickContextMenuItem } from './helpers';

// Mixturtrautonium.pch2 ships two real SeqNote (voice-area) instances, both at their
// hardware-widget default Magnifier/Octave view (zoom=1 [raw byte], octaveOffset=5, i.e. notes
// 48-72 visible — see visibleNoteWindow in src/renderer/pianoRoll.ts) — see
// src/parser/__tests__/patchRoundtrip.test.ts's "SeqNote pianoRollView round-trip" for the
// parser-level equivalent of this fixture fact.
test.describe('SeqNote piano-roll', () => {
	test('renders 16 step strips and the default zoom band selected', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		await expect(seqNote.locator('[data-testid="seqnote-step"]')).toHaveCount(16);
		await expect(seqNote.locator('[data-testid="seqnote-view-controls"]')).toBeVisible();
		await expect(seqNote.locator('[data-testid="seqnote-magnifier-button"]')).toHaveAttribute('data-zoom', '1');
	});

	test('clicking within a step strip sets its note value, and undo reverts it', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		const step = seqNote.locator('[data-testid="seqnote-step"][data-param-index="0"]');
		await step.scrollIntoViewIfNeeded();
		const before = await step.getAttribute('data-value');

		// zoom=1, octaveOffset=5 -> window [48, 72] (25 semitones). Row index 2 from the top is note
		// 70; away enough from the default center (64) that the click is guaranteed to change something.
		const strip = step.locator('[data-testid="seqnote-step-strip"]');
		const rect = await strip.evaluate((el) => {
			const r = (el as SVGGraphicsElement).getBoundingClientRect();
			return { top: r.top, left: r.left, width: r.width, height: r.height };
		});
		const rowIndexFromTop = 2;
		const visibleSemitoneCount = 25;
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

	test('the Magnifier button cycles zoom levels and updates the visible window', async ({ page, sendMenuAction, mockOpenPatch }) => {
		await mockOpenPatch('Mixturtrautonium.pch2');
		await sendMenuAction('open');
		await expect(page.locator('[data-testid="canvas-va"]')).toBeVisible();

		const seqNote = page.locator('[data-testid="canvas-va"] [data-module-short="SeqNote"]').first();
		const highlights = seqNote.locator('[data-testid="seqnote-step-value-highlight"]');
		const magnifier = seqNote.locator('[data-testid="seqnote-magnifier-button"]');

		await expect(magnifier).toHaveAttribute('data-zoom', '1');
		const countAtDefault = await highlights.count();

		await magnifier.click();
		await expect(magnifier).toHaveAttribute('data-zoom', '2');
		// zoom 2 is the narrowest window ([60, 72] vs. zoom 1's [48, 72]), changing which steps'
		// values are still in range.
		expect(await highlights.count()).not.toBe(countAtDefault);

		await magnifier.click();
		await expect(magnifier).toHaveAttribute('data-zoom', '0');

		// A third click cycles back to the starting zoom.
		await magnifier.click();
		await expect(magnifier).toHaveAttribute('data-zoom', '1');
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
		await expect(highlight).toHaveAttribute('fill', '#000');
	});
});
