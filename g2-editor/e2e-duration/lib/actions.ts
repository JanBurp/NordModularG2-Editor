import type { ElectronApplication, Page } from '@playwright/test';
import { evaluateWithRetry } from '../../e2e/fixtures/electron';
import { createCable, deleteModule, dropModuleOnCanvas } from '../../e2e/helpers';
import type { G2Snapshot } from './cli';
import { sleep } from './cli';

const SLOTS = ['A', 'B', 'C', 'D'];
// Module ids from nmg2mods (see e2e/cable-editing.spec.ts)
const OSC = { id: 97, short: 'OscA' };
const FLT = { id: 92, short: 'FltClassic' };

export interface ActionCtx {
	page: Page;
	app: ElectronApplication;
	snap: G2Snapshot;
	/** Deterministic random in [0,1). */
	rnd: () => number;
	/** Modules this test added per slot (never touches pre-existing modules). */
	own: Map<string, number[]>;
}

export interface ActionDef {
	name: string;
	weight: number;
	enabled?: (c: ActionCtx) => boolean;
	/** Returns a short note for the log; throws on failure. */
	run: (c: ActionCtx) => Promise<string | void>;
}

const int = (c: ActionCtx, n: number) => Math.floor(c.rnd() * n);
const pick = <T>(c: ActionCtx, a: T[]): T => a[int(c, a.length)];

export async function focusedSlot(page: Page): Promise<string> {
	const id = await page.locator('[data-testid^="slot-"].btn-active').first().getAttribute('data-testid');
	return SLOTS[Number(id?.split('-')[1] ?? 0)];
}

export const cliRun = (page: Page, args: string[]) => page.evaluate((a) => (window as any).cli.run(a) as Promise<string>, args);

const moduleIdxs = (page: Page): Promise<number[]> =>
	page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="canvas-va"] [data-module-idx]')).map((e) => Number(e.getAttribute('data-module-idx'))));

const cableCount = (page: Page): Promise<number> => page.locator('.svgcableborder[data-cable-key]').count();

/** short name + occurrence among same-short modules, which is what the shared helpers address modules by. */
const locate = (page: Page, idx: number, short: string): Promise<number> =>
	page.evaluate(
		({ idx, short }) =>
			Array.from(document.querySelectorAll(`[data-testid^="canvas-"] [data-module-short="${short}"]`)).findIndex((m) => m.getAttribute('data-module-idx') === String(idx)),
		{ idx, short },
	);

async function teardown(c: ActionCtx, slot: string): Promise<string> {
	const mods = c.own.get(slot) ?? [];
	c.own.delete(slot);
	let removed = 0;
	for (const [idx, short] of [[mods[0], OSC.short], [mods[1], FLT.short]] as const) {
		if (idx === undefined) continue;
		const occ = await locate(c.page, idx, short);
		if (occ < 0) continue; // already gone (e.g. slot reloaded)
		await deleteModule(c.page, short, occ, () =>
			evaluateWithRetry(c.app, ({ BrowserWindow }) => {
				BrowserWindow.getAllWindows()[0]?.webContents.send('menu:action', 'delete');
			}),
		);
		removed++;
	}
	return `removed ${removed} test modules`;
}

export const ACTIONS: ActionDef[] = [
	{
		name: 'switchSlot',
		weight: 3,
		run: async (c) => {
			const i = int(c, 4);
			await c.page.locator(`[data-testid="slot-${i}"]`).click();
			await sleep(1500);
			return `slot ${SLOTS[i]}`;
		},
	},
	{
		name: 'switchVariation',
		weight: 2,
		run: async (c) => {
			const i = int(c, 8);
			await c.page.locator(`[data-testid="variation-${i}"]`).click();
			await sleep(1000);
			return `variation ${i + 1}`;
		},
	},
	{
		name: 'tweakParam',
		weight: 5,
		run: async (c) => {
			const knobs = c.page.locator('[data-testid^="canvas-"] [data-param-index]');
			const n = await knobs.count();
			if (n === 0) return 'skipped: no params on canvas';
			const knob = knobs.nth(int(c, n));
			await knob.scrollIntoViewIfNeeded();
			const r = await knob.evaluate((el) => {
				const b = (el as Element).getBoundingClientRect();
				return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
			});
			const delta = (c.rnd() < 0.5 ? -1 : 1) * 10 * (2 + int(c, 6));
			await c.page.mouse.move(r.x, r.y);
			await c.page.mouse.wheel(0, delta);
			await sleep(400);
			await c.page.mouse.wheel(0, -delta); // put the value back so the patch stays roughly as loaded
			await sleep(400);
			return `wheel ${delta} on param #${await knob.getAttribute('data-param-index')}`;
		},
	},
	{
		// Edit module + cabling: add OscA and FltClassic, cable them; next time round remove them again.
		name: 'moduleAndCable',
		weight: 3,
		run: async (c) => {
			const slot = await focusedSlot(c.page);
			if (c.own.has(slot)) return teardown(c, slot);

			const before = await moduleIdxs(c.page);
			const cablesBefore = await cableCount(c.page);
			await dropModuleOnCanvas(c.page, OSC.id, 3 + int(c, 6), int(c, 12));
			await dropModuleOnCanvas(c.page, FLT.id, 3 + int(c, 6), 14 + int(c, 6));
			await sleep(1000);
			const added = (await moduleIdxs(c.page)).filter((i) => !before.includes(i));
			if (added.length !== 2) throw new Error(`expected 2 new modules, found ${added.length}`);
			const xIsOsc = (await locate(c.page, added[0], OSC.short)) >= 0;
			const [osc, flt] = xIsOsc ? [added[0], added[1]] : [added[1], added[0]];
			// Register before cabling so a failure below still gets cleaned up on the next round.
			c.own.set(slot, [osc, flt]);

			await createCable(
				c.page,
				{ moduleShort: OSC.short, jackType: 'output', connectorIdx: 0, occurrence: await locate(c.page, osc, OSC.short) },
				{ moduleShort: FLT.short, jackType: 'input', connectorIdx: 0, occurrence: await locate(c.page, flt, FLT.short) },
			);
			await sleep(1000);
			if ((await cableCount(c.page)) !== cablesBefore + 1) throw new Error('cable was not created');
			return `added ${OSC.short}+${FLT.short} with cable on slot ${slot}`;
		},
	},
	{
		name: 'loadPatch',
		weight: 2,
		enabled: (c) => Object.keys(c.snap.patchBanks).length > 0,
		run: async (c) => {
			const bank = pick(c, Object.keys(c.snap.patchBanks));
			const item = pick(c, c.snap.patchBanks[bank]);
			const slot = await focusedSlot(c.page);
			await cliRun(c.page, ['select-patch', slot, bank, String(item.location)]);
			c.own.delete(slot);
			await sleep(4000); // editor reloads the slot from the hardware echo
			return `${slot} <- bank ${bank}/${item.location} "${item.name}"`;
		},
	},
	{
		// Only in Performance mode: select-perf in Patch mode would flip the G2's mode.
		name: 'loadPerformance',
		weight: 1,
		enabled: (c) => c.snap.mode === 'Performance' && Object.keys(c.snap.perfBanks).length > 0,
		run: async (c) => {
			const bank = pick(c, Object.keys(c.snap.perfBanks));
			const item = pick(c, c.snap.perfBanks[bank]);
			await cliRun(c.page, ['select-perf', bank, String(item.location)]);
			c.own.clear();
			await sleep(8000);
			return `performance bank ${bank}/${item.location} "${item.name}"`;
		},
	},
];

export function pickAction(c: ActionCtx): ActionDef {
	const pool = ACTIONS.filter((a) => a.enabled?.(c) ?? true);
	let r = c.rnd() * pool.reduce((s, a) => s + a.weight, 0);
	for (const a of pool) if ((r -= a.weight) < 0) return a;
	return pool[0];
}
