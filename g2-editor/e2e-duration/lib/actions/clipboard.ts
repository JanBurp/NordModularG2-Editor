import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, type OwnModule, focusOwn, focusedSlot, int, menuAction, moduleIdxs, orSkip, pick, pickOwn, selectModule } from './ctx';
import { hasOwn, waitNewIdxs } from './modules';

/** Hovers an empty cell far right on the canvas, so paste lands there (paste uses the last mouse position). */
async function hoverFreeCell(c: ActionCtx, m: OwnModule): Promise<void> {
	const box = await c.page.locator(`[data-testid="canvas-${m.area}"]`).boundingBox();
	if (!box) throw new Error(`canvas ${m.area} not laid out`);
	await c.page.mouse.move(box.x + (12 + int(c, 4)) * 256 + 40, box.y + (20 + int(c, 20)) * 16);
}

/** copy+paste or cut+paste of one own module; the pasted module becomes own. */
const clip = (cut: boolean): ActionDef['run'] => async (c) =>
	orSkip('module gone', async () => {
		const m = await pickOwn(c);
		if (!m) return 'skipped: no own module';
		const slot = await focusedSlot(c.page);
		await selectModule(c, m);
		await menuAction(c, cut ? 'cut' : 'copy');
		await sleep(300);
		const before = await moduleIdxs(c.page, m.area);
		await hoverFreeCell(c, m);
		await menuAction(c, 'paste');
		const fresh = await waitNewIdxs(c, m.area, before, 1);
		if (fresh.length !== 1) throw new Error(`paste of ${m.short}#${m.idx}: expected 1 new module, found [${fresh}]`);
		const kept = (c.own.get(slot) ?? []).filter((o) => !(cut && o === m));
		c.own.set(slot, [...kept, { ...m, idx: fresh[0] }]);
		return `${cut ? 'cut' : 'copied'} ${m.short}#${m.idx}, pasted as #${fresh[0]}`;
	});

export const CLIPBOARD_ACTIONS: ActionDef[] = [
	{ name: 'copyPaste', weight: 1, enabled: hasOwn, run: clip(false) },
	{ name: 'cutPaste', weight: 1, enabled: hasOwn, run: clip(true) },
	{
		// Copy one own module, paste its params onto another own module of the same type (or onto itself).
		name: 'pasteParams',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('module gone', async () => {
				const { mods } = await focusOwn(c);
				if (mods.length === 0) return 'skipped: no own module';
				const src = pick(c, mods);
				const dst = pick(c, mods.filter((o) => o.type === src.type && o.area === src.area));
				await selectModule(c, src);
				await menuAction(c, 'copy');
				await sleep(200);
				await selectModule(c, dst);
				await menuAction(c, 'paste-params');
				await sleep(300);
				return `params of ${src.short}#${src.idx} pasted onto #${dst.idx}`;
			}),
	},
	{
		// Net zero: undo then redo of the focused slot's last edit.
		name: 'undoRedo',
		weight: 1,
		burst: true,
		run: async (c, fast) => {
			await menuAction(c, 'undo');
			await sleep(fast ? 100 : 600);
			await menuAction(c, 'redo');
			await sleep(fast ? 100 : 600);
			return 'undo + redo';
		},
	},
];
