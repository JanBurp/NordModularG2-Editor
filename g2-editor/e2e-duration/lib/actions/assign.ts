import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, clickItem, ensureShown, hoverItem, int, menuLabels, openMenu, orSkip, pick, pickOwn, pickParam } from './ctx';
import { hasOwn } from './modules';
import { hasParams } from './params';

const PAGES = ['A', 'B', 'C', 'D', 'E'].flatMap((p) => [1, 2, 3].map((b) => `Page ${p}${b}`));

/** Right-click an own param; returns its menu labels, or a skip note. */
async function paramMenu(c: ActionCtx): Promise<{ labels: string[]; what: string } | string> {
	const m = await pickOwn(c, (o) => hasParams(o.type));
	const p = m && (await pickParam(c, m));
	if (!p) return 'skipped: no own module with params';
	await openMenu(c.page, p.el);
	return { labels: await menuLabels(c.page), what: `param #${p.index} of ${m!.short}#${m!.idx}` };
}

/** Assign to a random page knob, or deassign when the param already has one. */
const knobAssign = (assign: string, deassign: string): ActionDef['run'] => async (c) =>
	orSkip('assign menu', async () => {
		const pm = await paramMenu(c);
		if (typeof pm === 'string') return pm;
		const existing = pm.labels.find((l) => l.startsWith(`${deassign} (`));
		if (existing) {
			await clickItem(c.page, existing);
			return `${existing} on ${pm.what}`;
		}
		if (!pm.labels.includes(assign)) return `skipped: ${pm.what} is not assignable`;
		const page = pick(c, PAGES);
		const knob = `Knob ${1 + int(c, 8)}`;
		await hoverItem(c.page, assign);
		await hoverItem(c.page, page);
		await clickItem(c.page, knob);
		return `${assign} ${page} ${knob} on ${pm.what}`;
	});

export const ASSIGN_ACTIONS: ActionDef[] = [
	{ name: 'assignKnob', weight: 2, enabled: hasOwn, run: knobAssign('Assign to Page', 'Deassign') },
	{ name: 'assignGlobalKnob', weight: 1, enabled: hasOwn, run: knobAssign('Assign to Global Page', 'Deassign Global') },
	{
		// Assign a CC from the "Assign CC…" list, or deassign an existing one.
		name: 'assignCC',
		weight: 2,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('CC menu', async () => {
				const pm = await paramMenu(c);
				if (typeof pm === 'string') return pm;
				const existing = pm.labels.find((l) => l.startsWith('Deassign CC ('));
				if (existing) {
					await clickItem(c.page, existing);
					return `${existing} on ${pm.what}`;
				}
				if (!pm.labels.includes('Assign CC…')) return `skipped: ${pm.what} has no CC menu`;
				await hoverItem(c.page, 'Assign CC…');
				const ccs = (await menuLabels(c.page)).filter((l) => l.startsWith('CC '));
				if (ccs.length === 0) return 'skipped: no CC numbers offered';
				const cc = pick(c, ccs);
				await clickItem(c.page, cc);
				return `assigned ${cc} to ${pm.what}`;
			}),
	},
	{
		// Parameter Pages toolbar: bank, page and (round trip) the Patch/Global knob source.
		name: 'selectParamPage',
		weight: 2,
		run: async (c) =>
			orSkip('parameter pages', async () => {
				if (!(await ensureShown(c, c.page.locator('[data-testid="param-page-0"]'), 'toggle-parameter-pages'))) return 'skipped: parameter pages not shown';
				const bank = 1 + int(c, 3);
				const page = int(c, 5);
				await c.page.locator(`[data-testid="param-bank-${bank}"]`).click({ timeout: 3000 });
				await c.page.locator(`[data-testid="param-page-${page}"]`).click({ timeout: 3000 });
				if (c.rnd() < 0.3) {
					const toggle = c.page.locator('[data-testid="global-pages-toggle"]');
					await toggle.click({ timeout: 3000 });
					await sleep(800);
					await toggle.click({ timeout: 3000 }); // back to the source it was
					return `bank ${bank} page ${'ABCDE'[page]}, knob source toggled and back`;
				}
				return `bank ${bank} page ${'ABCDE'[page]}`;
			}),
	},
];
