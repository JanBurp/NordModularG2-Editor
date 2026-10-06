import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, ensureExtendedToolbar, ensureShown, fillDialog, focusedSlot, int, orSkip, pick, UI_TIMEOUT_MS, waitIdle } from './ctx';

const RESTORE_AFTER_MS = 1500;

/** The patch name in the patch toolbar (the toolbar that holds the Sound Category select). */
const patchName = (c: ActionCtx) => c.page.locator(':has(> div > select[title="Sound Category"]) > span.text.cursor-pointer').first();

/** The Collapsible section with this title in the Settings pane (never "Synth Settings"). */
const settingsSection = (c: ActionCtx, title: 'Patch Settings' | 'Performance Settings') =>
	c.page.locator(`div:has(> div > span.font-medium:text-is("${title}"))`).last();

/** Opens a Settings section; open-*-settings toggles, so only send it when the section's rows aren't showing. */
export async function openSection(c: ActionCtx, title: 'Patch Settings' | 'Performance Settings', action: string): Promise<import('@playwright/test').Locator | null> {
	const section = settingsSection(c, title);
	return (await ensureShown(c, section.locator('div.settings-row'), action)) ? section : null;
}

export const PATCH_ACTIONS: ActionDef[] = [
	{
		// Voice mode or category select in the patch toolbar, restored afterwards.
		name: 'patchDescription',
		weight: 1,
		run: async (c) =>
			orSkip('patch toolbar select', async () => {
				const title = pick(c, ['Voice mode / count', 'Sound Category']);
				const select = c.page.locator(`select[title="${title}"]`);
				const old = await select.inputValue({ timeout: UI_TIMEOUT_MS });
				const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
				const next = pick(c, values.filter((v) => v !== old));
				await select.selectOption(next, { timeout: UI_TIMEOUT_MS });
				await sleep(RESTORE_AFTER_MS);
				await select.selectOption(old, { timeout: UI_TIMEOUT_MS });
				return `${title} ${old} → ${next} → ${old}`;
			}),
	},
	{
		// Patch Level knob (wheel and back) or the mute checkbox (twice).
		name: 'patchLevel',
		weight: 1,
		run: async (c) =>
			orSkip('patch level', async () => {
				const row = c.page.locator('div.h-6.flex.items-center.gap-2:has(> [role=checkbox])').first();
				if (c.rnd() < 0.7) {
					const knob = row.locator('svg').first();
					const b = await knob.boundingBox({ timeout: UI_TIMEOUT_MS });
					if (!b) return 'skipped: patch level knob not laid out';
					const delta = (c.rnd() < 0.5 ? -1 : 1) * 10 * (1 + int(c, 10));
					await c.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
					await c.page.mouse.wheel(0, delta);
					await sleep(RESTORE_AFTER_MS);
					await c.page.mouse.wheel(0, -delta);
					return `patch level ${delta} and back`;
				}
				const box = row.locator('[role=checkbox]');
				await box.click({ timeout: UI_TIMEOUT_MS });
				await sleep(RESTORE_AFTER_MS);
				await box.click({ timeout: UI_TIMEOUT_MS });
				return 'patch mute toggled and back';
			}),
	},
	{
		// One button group in Patch Settings (Glide type, Octave shift, Vibrato source, Arp …), restored.
		name: 'patchSettings',
		weight: 1,
		run: async (c) =>
			orSkip('patch settings', async () => {
				const section = await openSection(c, 'Patch Settings', 'open-patch-settings');
				if (!section) return 'skipped: patch settings not shown';
				const rows = section.locator('div.settings-row:has(button.btn)');
				const n = await rows.count();
				if (n === 0) return 'skipped: no button rows';
				const row = rows.nth(int(c, n));
				const label = (await row.locator('span').first().innerText({ timeout: UI_TIMEOUT_MS })).trim();
				const buttons = row.locator('button.btn');
				const old = row.locator('button.btn.btn-active').first();
				const oldText = (await old.innerText({ timeout: UI_TIMEOUT_MS })).trim();
				const k = int(c, await buttons.count());
				await buttons.nth(k).click({ timeout: UI_TIMEOUT_MS });
				await sleep(RESTORE_AFTER_MS);
				await row.locator('button.btn', { hasText: oldText }).first().click({ timeout: UI_TIMEOUT_MS });
				return `${label}: button ${k} and back to ${oldText}`;
			}),
	},
	{
		name: 'renamePatch',
		weight: 1,
		run: async (c) =>
			orSkip('rename patch', async () => {
				const nameEl = patchName(c);
				const old = (await nameEl.innerText({ timeout: UI_TIMEOUT_MS })).trim();
				const name = `Test${int(c, 1000)}`;
				for (const n of [name, old]) {
					await nameEl.click({ timeout: UI_TIMEOUT_MS });
					await fillDialog(c.page, 'Rename Patch', n);
					await sleep(RESTORE_AFTER_MS);
				}
				return `patch renamed to ${name} and back to "${old}"`;
			}),
	},
	{
		// Text Pad edit: "Save now" re-uploads the whole slot (upload-patch-data); then restored the same way.
		name: 'editPatchNotes',
		weight: 1,
		run: async (c) =>
			orSkip('text pane', async () => {
				const area = c.page.locator('textarea[placeholder="Patch notes…"]');
				if (!(await ensureShown(c, area, 'toggle-text-panel'))) return 'skipped: text pane not shown';
				const old = await area.inputValue({ timeout: UI_TIMEOUT_MS });
				for (const text of [`${old}\nduration test ${new Date().toISOString()}`, old]) {
					await area.fill(text, { timeout: UI_TIMEOUT_MS });
					await c.page.locator('button:text-is("Save now")').click({ timeout: UI_TIMEOUT_MS });
					await waitIdle(c.page);
					await c.page.locator('span.text-green-600').first().waitFor({ state: 'visible', timeout: 15_000 });
				}
				return `patch notes edited, uploaded, restored (${old.length} chars)`;
			}),
	},
	{
		// New / Init 1 / Init 2 replace the focused slot's patch (upload-patch).
		name: 'newOrInitPatch',
		weight: 1,
		run: async (c) =>
			orSkip('extended toolbar', async () => {
				if (!(await ensureExtendedToolbar(c))) return 'skipped: extended toolbar not shown';
				const slot = await focusedSlot(c.page);
				const label = pick(c, ['New', 'Init 1', 'Init 2']);
				await c.page.locator(`button.btn-default:text-is("${label}")`).click({ timeout: UI_TIMEOUT_MS });
				c.own.delete(slot);
				await waitIdle(c.page);
				await sleep(2000);
				return `${label} into slot ${slot}`;
			}),
	},
];
