import { getModule } from '../../../src/renderer/nmg2mods';
import { isSwitch } from '../../../src/utils/moduleControls';
import { sleep } from '../cli';
import { type ActionDef, clickItem, hitPoint, int, menuLabels, moduleLocator, openMenu, orSkip, pick, pickOwn, pickParam, selectModule, UI_TIMEOUT_MS } from './ctx';
import { hasOwn, pickOrAddOwn } from './modules';

const hasModes = (type: number) => (getModule(type)?.modes?.length ?? 0) > 0;
export const hasParams = (type: number) => (getModule(type)?.params?.length ?? 0) > 0;
/** Knobs/sliders: switches have no Set Value. */
const knobParams = (type: number) => (getModule(type)?.params ?? []).flatMap((p, i) => (isSwitch(p.n) ? [] : [i]));
/** Params that get "Rename label": switches with a label list (Module.vue onParamContextMenu). */
const labelledParams = (type: number) => (getModule(type)?.params ?? []).flatMap((p, i) => (p.label && isSwitch(p.n) ? [i] : []));

export const PARAM_ACTIONS: ActionDef[] = [
	{
		// Any visible knob, also the user's own modules: the wheel is put back afterwards.
		name: 'tweakParam',
		weight: 5,
		burst: true,
		run: async (c, fast) =>
			orSkip('canvas remounted', async () => {
				// The inactive canvas stays in the DOM (v-show), so only visible knobs are candidates.
				const knobs = c.page.locator('[data-testid^="canvas-"]:visible [data-param-index]');
				let n = await knobs.count();
				if (n === 0 && !fast) {
					// An empty patch: go to a slot with the test's own modules, or add one.
					const m = await pickOrAddOwn(c, hasParams);
					if (typeof m === 'string') return m;
					n = await knobs.count();
				}
				if (n === 0) return 'skipped: no params on canvas';
				const knob = knobs.nth(int(c, n));
				const param = await knob.getAttribute('data-param-index', { timeout: UI_TIMEOUT_MS });
				const r = await hitPoint(knob);
				await c.page.mouse.move(r.x, r.y);
				// A fast spin: several quick wheel ticks the way a human flicks a knob.
				const ticks = fast ? 4 + int(c, 6) : 1;
				const delta = (c.rnd() < 0.5 ? -1 : 1) * 10 * (2 + int(c, 6));
				for (let i = 0; i < ticks; i++) await c.page.mouse.wheel(0, delta);
				await sleep(fast ? 80 : 400);
				for (let i = 0; i < ticks; i++) await c.page.mouse.wheel(0, -delta); // put the value back
				await sleep(fast ? 80 : 400);
				return `wheel ${ticks}x${delta} on param #${param}`;
			}),
	},
	{
		name: 'dragParam',
		weight: 2,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('param gone', async () => {
				const m = await pickOwn(c);
				const p = m && (await pickParam(c, m));
				if (!p) return 'skipped: no own module with params';
				const r = await hitPoint(p.el);
				const dy = (c.rnd() < 0.5 ? -1 : 1) * (10 + int(c, 40));
				await c.page.mouse.move(r.x, r.y);
				await c.page.mouse.down();
				await c.page.mouse.move(r.x, r.y + dy, { steps: 5 });
				await c.page.mouse.move(r.x, r.y, { steps: 5 }); // and back
				await c.page.mouse.up();
				return `dragged param #${p.index} of ${m!.short}#${m!.idx} by ${dy}px and back`;
			}),
	},
	{
		// Title click selects the module and its first param; arrows step params and values.
		name: 'keyboardParam',
		weight: 2,
		burst: true,
		enabled: hasOwn,
		run: async (c, fast) =>
			orSkip('module gone', async () => {
				const m = await pickOwn(c);
				if (!m) return 'skipped: no own module';
				await selectModule(c, m);
				for (let i = int(c, 3); i > 0; i--) await c.page.keyboard.press('ArrowRight');
				const key = c.rnd() < 0.5 ? 'ArrowUp' : 'ArrowDown';
				const big = c.rnd() < 0.25;
				const steps = 1 + int(c, fast ? 8 : 4);
				for (let i = 0; i < steps; i++) await c.page.keyboard.press(big ? `Alt+${key}` : key);
				return `${steps}x ${big ? 'Alt+' : ''}${key} on ${m.short}#${m.idx}`;
			}),
	},
	{
		name: 'setMode',
		weight: 1,
		run: async (c) =>
			orSkip('mode control gone', async () => {
				const m = await pickOrAddOwn(c, hasModes);
				if (typeof m === 'string') return m;
				const modes = moduleLocator(c.page, m).locator('g.modes > svg');
				const n = await modes.count();
				if (n === 0) return `skipped: ${m.short} has no modes`;
				const k = int(c, n);
				const at = await hitPoint(modes.nth(k));
				await c.page.mouse.click(at.x, at.y);
				const dropdown = c.page.locator('[data-testid="mode-dropdown"]');
				if (await dropdown.isVisible()) {
					const options = dropdown.locator('svg[role=option]');
					const o = int(c, await options.count());
					await options.nth(o).click({ timeout: UI_TIMEOUT_MS });
					return `mode ${k} of ${m.short}#${m.idx} → option ${o}`;
				}
				return `mode ${k} of ${m.short}#${m.idx} cycled`;
			}),
	},
	{
		name: 'setParamValue',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('Set Value dialog', async () => {
				const m = await pickOrAddOwn(c, (t) => knobParams(t).length > 0);
				if (typeof m === 'string') return m;
				const index = pick(c, knobParams(m.type));
				const p = { el: moduleLocator(c.page, m).locator(`[data-param-index="${index}"]`).first(), index };
				await openMenu(c.page, p.el);
				if (!(await menuLabels(c.page)).includes('Set Value')) return `skipped: param #${index} of ${m.short} offers no Set Value`;
				await clickItem(c.page, 'Set Value');
				const dialog = c.page.getByTestId('param-edit-dialog');
				const input = dialog.locator('input');
				// "#<raw>" picks an exact raw value; a range smaller than 128 may not have it, raw 0 always exists.
				await input.fill(`#${int(c, 128)}`, { timeout: UI_TIMEOUT_MS });
				const noMatch = dialog.getByText('No matching value');
				await dialog.getByRole('option').first().or(noMatch).waitFor({ timeout: UI_TIMEOUT_MS });
				if (await noMatch.isVisible()) await input.fill('#0', { timeout: UI_TIMEOUT_MS });
				await dialog.getByRole('button', { name: 'Set' }).click({ timeout: UI_TIMEOUT_MS });
				await dialog.waitFor({ state: 'hidden', timeout: UI_TIMEOUT_MS });
				return `Set Value on param #${p.index} of ${m.short}#${m.idx}`;
			}),
	},
	{
		// Exercises the fixed-size param-label block (set-module-labels).
		name: 'renameSwitchLabel',
		weight: 1,
		run: async (c) =>
			orSkip('Rename Label dialog', async () => {
				const m = await pickOrAddOwn(c, (t) => labelledParams(t).length > 0);
				if (typeof m === 'string') return m;
				const index = pick(c, labelledParams(m.type));
				const p = { el: moduleLocator(c.page, m).locator(`[data-param-index="${index}"]`).first(), index };
				await openMenu(c.page, p.el);
				if (!(await menuLabels(c.page)).includes('Rename label')) return `skipped: param #${p.index} of ${m.short} offers no Rename label`;
				await clickItem(c.page, 'Rename label');
				const name = `L${int(c, 1000)}`;
				const dialog = c.page.getByRole('dialog', { name: 'Rename Label' });
				await dialog.locator('input').fill(name, { timeout: UI_TIMEOUT_MS });
				await dialog.getByRole('button', { name: 'Rename' }).click({ timeout: UI_TIMEOUT_MS });
				await dialog.waitFor({ state: 'hidden', timeout: UI_TIMEOUT_MS });
				return `label of param #${p.index} on ${m.short}#${m.idx} → ${name}`;
			}),
	},
];
