import { clickContextMenuItem, dropModuleOnCanvas, hoverContextMenuItem, knobOf, openContextMenu, selectModule, setKnobRaw } from './helpers';
import { expect, test } from './fixtures/electron';

const OSC_A = 97;

test.describe('Copy to Variations', () => {
	test.beforeEach(async ({ page, sendMenuAction }) => {
		await sendMenuAction('new-patch');
		await dropModuleOnCanvas(page, OSC_A, 0, 0);
	});

	test('Edit menu copies the selected module to all variations, as one undo step', async ({ page, sendMenuAction }) => {
		const knob = knobOf(page, 'OscA', 0);
		const before = await knob.getAttribute('data-value');
		await setKnobRaw(page, 'OscA', 0, 10);
		await selectModule(page, 'OscA', 0);

		// Undo first: switching variation is an undo step of its own (the Patch Mutator's focus)
		await sendMenuAction('copy-params-to-variations:all');
		await sendMenuAction('undo');
		await expect(knob).toHaveAttribute('data-value', '10'); // the source variation is untouched
		await sendMenuAction('variation-3');
		await expect(knob).toHaveAttribute('data-value', before!);

		await sendMenuAction('variation-1');
		await sendMenuAction('copy-params-to-variations:all');
		await sendMenuAction('variation-3');
		await expect(knob).toHaveAttribute('data-value', '10');
		await sendMenuAction('variation-8');
		await expect(knob).toHaveAttribute('data-value', '10');
	});

	test('the param context menu copies just that param to one variation', async ({ page, sendMenuAction }) => {
		const knob0 = knobOf(page, 'OscA', 0, 0);
		const knob1 = knobOf(page, 'OscA', 0, 1);
		const before0 = await knob0.getAttribute('data-value');
		const before1 = await knob1.getAttribute('data-value');
		await setKnobRaw(page, 'OscA', 0, 10);
		await openContextMenu(page, knob0);
		await hoverContextMenuItem(page, 'Copy to Variations');
		await clickContextMenuItem(page, 'Variation 2');

		await sendMenuAction('variation-2');
		await expect(knob0).toHaveAttribute('data-value', '10');
		await expect(knob1).toHaveAttribute('data-value', before1!);
		await sendMenuAction('variation-3');
		await expect(knob0).toHaveAttribute('data-value', before0!);
	});
});
