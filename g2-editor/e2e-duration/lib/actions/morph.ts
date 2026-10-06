import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, clickItem, ensureExtendedToolbar, fillDialog, hoverItem, int, menuLabels, openMenu, orSkip, pick, pickOwn, pickParam, selectModule, UI_TIMEOUT_MS } from './ctx';
import { hasOwn } from './modules';

/** The 8 morph group columns in the Extended Toolbar. */
const groups = (c: ActionCtx) => c.page.locator('div.relative.flex.flex-col.min-w-14');

async function pickGroup(c: ActionCtx): Promise<{ col: import('@playwright/test').Locator; g: number } | null> {
	if (!(await ensureExtendedToolbar(c))) return null;
	const n = await groups(c).count();
	if (n === 0) return null;
	const g = int(c, n);
	return { col: groups(c).nth(g), g };
}

export const MORPH_ACTIONS: ActionDef[] = [
	{
		name: 'morphAssign',
		weight: 2,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('param menu', async () => {
				const m = await pickOwn(c);
				const p = m && (await pickParam(c, m));
				if (!p) return 'skipped: no own module with params';
				await openMenu(c.page, p.el);
				const label = (await menuLabels(c.page)).find((l) => l.startsWith('Morph assign'));
				if (!label) return `skipped: param #${p.index} has no morph item`;
				await clickItem(c.page, label);
				return `${label} on param #${p.index} of ${m!.short}#${m!.idx}`;
			}),
	},
	{
		// Meta-drag on a param sets its morph range (only if it is assigned to the selected group).
		name: 'morphRange',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('param gone', async () => {
				const m = await pickOwn(c);
				const p = m && (await pickParam(c, m));
				if (!p) return 'skipped: no own module with params';
				await p.el.scrollIntoViewIfNeeded({ timeout: UI_TIMEOUT_MS });
				const b = await p.el.boundingBox({ timeout: UI_TIMEOUT_MS });
				if (!b) return 'skipped: param not laid out';
				const dy = (c.rnd() < 0.5 ? -1 : 1) * (10 + int(c, 50));
				await c.page.keyboard.down('Meta');
				await c.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
				await c.page.mouse.down();
				await c.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 5 });
				await c.page.mouse.up();
				await c.page.keyboard.up('Meta');
				return `morph range drag ${dy}px on param #${p.index} of ${m!.short}#${m!.idx}`;
			}),
	},
	{
		// Meta+1..8 selects a morph group, Meta+Enter toggles the selected param's assignment.
		name: 'morphGroupKeys',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('module gone', async () => {
				const m = await pickOwn(c);
				if (!m) return 'skipped: no own module';
				await selectModule(c, m);
				const g = 1 + int(c, 8);
				await c.page.keyboard.press(`Meta+Digit${g}`);
				await c.page.keyboard.press('Meta+Enter');
				return `group ${g} + toggle on ${m.short}#${m.idx}`;
			}),
	},
	{
		name: 'morphDial',
		weight: 2,
		burst: true,
		run: async (c, fast) =>
			orSkip('morph toolbar', async () => {
				const grp = await pickGroup(c);
				if (!grp) return 'skipped: morph toolbar not shown';
				const knob = grp.col.locator('svg').first();
				const b = await knob.boundingBox({ timeout: UI_TIMEOUT_MS });
				if (!b) return 'skipped: morph knob not laid out';
				await c.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
				const delta = (c.rnd() < 0.5 ? -1 : 1) * 10 * (1 + int(c, 8));
				const ticks = fast ? 3 + int(c, 5) : 1;
				for (let i = 0; i < ticks; i++) await c.page.mouse.wheel(0, delta);
				await sleep(fast ? 80 : 400);
				for (let i = 0; i < ticks; i++) await c.page.mouse.wheel(0, -delta); // put it back
				return `morph dial ${grp.g + 1} ${ticks}x${delta} and back`;
			}),
	},
	{
		// Group menu: Copy To another group, or Rename (and back).
		name: 'morphGroupMenu',
		weight: 1,
		run: async (c) =>
			orSkip('morph group menu', async () => {
				const grp = await pickGroup(c);
				if (!grp) return 'skipped: morph toolbar not shown';
				if (c.rnd() < 0.5) {
					await openMenu(c.page, grp.col);
					await hoverItem(c.page, 'Copy To');
					const targets = (await menuLabels(c.page)).filter((l) => l.startsWith('Group '));
					if (targets.length === 0) return 'skipped: no copy targets';
					const t = pick(c, targets);
					await clickItem(c.page, t);
					return `morph group ${grp.g + 1} copied to ${t}`;
				}
				const old = (await grp.col.locator('span.text-xs.text-black').first().innerText({ timeout: UI_TIMEOUT_MS })).trim();
				const name = `T${int(c, 1000)}`;
				for (const n of [name, old]) {
					await openMenu(c.page, grp.col);
					await clickItem(c.page, 'Rename…');
					await fillDialog(c.page, 'Rename Morph Group', n);
					await sleep(500);
				}
				return `morph group ${grp.g + 1} renamed to ${name} and back to ${old}`;
			}),
	},
];
